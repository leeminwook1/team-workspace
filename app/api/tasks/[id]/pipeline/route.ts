import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import { requireActiveUser, json, badId } from "@/lib/api";
import { canEditTaskDoc, canChangeStatusAny } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { touchChanged } from "@/lib/changes";
import { returnTaskReservations } from "@/lib/taskReservations";
import { STEP_KEYS, STEP_LABEL, serializePipeline, defaultReportDue, type StepKey } from "@/lib/pipeline";

// PATCH /api/tasks/:id/pipeline — 촬영 진행 관리
//  { step, done }      단계 체크/해제 — 담당자·등록자·과장·부과장·부장단
//  { on, reportDue }   진행 관리 켜기/끄기·보고 마감 변경 — 일정 수정 권한자
//  { selectDue }       셀렉 마감 지정/해제 — 단계 체크 권한자(담당자 포함)
// "보고"까지 끝나면 일정을 완료 처리하고 연동 장비를 자동 반납한다.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "잘못된 요청입니다." }, 400);

  await connectDB();
  const task: any = await Task.findById(params.id);
  if (!task) return json({ error: "일정을 찾을 수 없습니다." }, 404);
  const teamIds = (task.teamIds ?? []).map(String);
  const assignees = (task.assignees ?? []).map(String);
  const createdBy = task.createdBy ? String(task.createdBy) : null;
  const canEdit = canEditTaskDoc(user, teamIds, createdBy);
  const canStep = canEdit || canChangeStatusAny(user, teamIds, assignees);

  // 켜기/끄기·보고 마감
  if (body.on !== undefined || body.reportDue !== undefined) {
    if (!canEdit) return json({ error: "진행 관리를 바꿀 권한이 없습니다." }, 403);
    if (typeof body.on === "boolean") {
      task.pipeline.on = body.on;
      if (body.on && !task.pipeline.reportDue) task.pipeline.reportDue = defaultReportDue(task.endDate);
    }
    if (body.reportDue !== undefined) {
      const d = body.reportDue ? new Date(body.reportDue) : null;
      if (d && isNaN(d.getTime())) return json({ error: "날짜 형식이 잘못됐습니다." }, 400);
      task.pipeline.reportDue = d;
    }
  }

  // 셀렉 마감 — 바로 셀렉을 못 할 때 담당자가 기한을 적어둔다
  if (body.selectDue !== undefined) {
    if (!canStep) return json({ error: "셀렉 마감을 정할 권한이 없습니다. (담당자·과장)" }, 403);
    if (!task.pipeline?.on) return json({ error: "진행 관리가 꺼져 있어요." }, 409);
    const d = body.selectDue ? new Date(body.selectDue) : null;
    if (d && isNaN(d.getTime())) return json({ error: "날짜 형식이 잘못됐습니다." }, 400);
    task.pipeline.selectDue = d;
  }

  // 단계 체크
  let finished = false;
  let equipDone: string[] = [];
  if (body.step !== undefined) {
    const step = body.step as StepKey;
    if (!STEP_KEYS.includes(step)) return json({ error: "알 수 없는 단계입니다." }, 400);
    if (!task.pipeline?.on) return json({ error: "진행 관리가 꺼져 있어요." }, 409);
    if (!canStep) return json({ error: "진행 상황을 바꿀 권한이 없습니다. (담당자·과장)" }, 403);
    const done = body.done !== false;
    const idx = STEP_KEYS.indexOf(step);
    if (done) {
      // 앞 단계가 비어 있으면 함께 체크 (보정 완료를 누르면 촬영~셀렉도 완료로 간주)
      for (let i = 0; i <= idx; i++) {
        const k = STEP_KEYS[i];
        if (!task.pipeline.steps[k]) {
          task.pipeline.steps[k] = new Date();
          task.pipeline.stepBy[k] = user.id;
        }
      }
      if (task.status === "todo") task.status = "in_progress";
      if (step === "report" && task.status !== "done") { task.status = "done"; finished = true; }
    } else {
      // 해제 — 뒤 단계도 함께 해제
      for (let i = idx; i < STEP_KEYS.length; i++) {
        const k = STEP_KEYS[i];
        task.pipeline.steps[k] = null;
        task.pipeline.stepBy[k] = null;
      }
      if (task.status === "done") task.status = "in_progress";
    }
    task.markModified("pipeline");
    await task.save();
    if (finished) {
      const rr = await returnTaskReservations(task._id, user.id);
      equipDone = [...rr.returned, ...rr.cancelled];
    }
    await logActivity({
      actorId: user.id, actorName: user.name, action: "status", targetTitle: task.title,
      meta: { detail: `${STEP_LABEL[step]} ${done ? "완료" : "취소"}${finished ? " — 보고 완료로 일정 종료" : ""}` },
    });
  } else {
    task.markModified("pipeline");
    await task.save();
    await touchChanged("task");
  }

  return json({ pipeline: serializePipeline(task.pipeline), status: task.status, ...(equipDone.length ? { equipReturned: equipDone } : {}) });
}
