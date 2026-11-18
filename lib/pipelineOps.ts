import { logActivity } from "./activity";
import { touchChanged } from "./changes";
import { returnTaskReservations } from "./taskReservations";
import { canEditTaskDoc, canChangeStatusAny, type SessionUser } from "./permissions";
import { STEP_KEYS, STEP_LABEL, type StepKey } from "./pipeline";

// 촬영 진행 단계 체크/해제 — 웹(/api/tasks/:id/pipeline)과 텔레그램 버튼이 같이 쓴다.
// "보고"까지 끝나면 일정을 완료 처리하고 연동 장비를 자동 반납한다.

/** 단계 체크 권한 — 담당자·등록자·과장·부과장·부장단 */
export function canStepPipeline(user: SessionUser, task: any) {
  const teamIds = (task.teamIds ?? []).map(String);
  const assignees = (task.assignees ?? []).map(String);
  const createdBy = task.createdBy ? String(task.createdBy) : null;
  return canEditTaskDoc(user, teamIds, createdBy) || canChangeStatusAny(user, teamIds, assignees);
}

/** task는 mongoose 문서 (저장까지 함). 권한·진행관리 켜짐 확인은 호출한 쪽에서 */
export async function applyPipelineStep(task: any, step: StepKey, done: boolean, user: SessionUser, via?: string) {
  const idx = STEP_KEYS.indexOf(step);
  let finished = false;
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
  let equipDone: string[] = [];
  if (finished) {
    const rr = await returnTaskReservations(task._id, user.id);
    equipDone = [...rr.returned, ...rr.cancelled];
  }
  await logActivity({
    actorId: user.id, actorName: user.name ?? "", action: "status", targetTitle: task.title,
    meta: { detail: `${STEP_LABEL[step]} ${done ? "완료" : "취소"}${finished ? " — 보고 완료로 일정 종료" : ""}${via ? ` (${via})` : ""}` },
  });
  await touchChanged("task"); // 웹 화면 자동 반영 (텔레그램에서 눌러도)
  return { finished, equipDone };
}
