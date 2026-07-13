import { connectDB } from "@/lib/mongodb";
import { Directive } from "@/models/Directive";
import { Task } from "@/models/Task";
import { requireActiveUser, json } from "@/lib/api";
import { canManageDirective } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";

// POST /api/directives/:id/convert — TODO(또는 분배 항목)를 달력 일정으로 등록
// body: { assignmentId?: string } — 있으면 해당 팀원 담당 일정, 없으면 TODO 전체를 팀 일정으로
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const dir: any = await Directive.findById(params.id).lean();
  if (!dir) return json({ error: "TODO를 찾을 수 없습니다." }, 404);
  if (!canManageDirective(user, String(dir.teamId))) {
    return json({ error: "일정 등록은 담당 팀장만 가능합니다." }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const assignmentId: string | undefined = body?.assignmentId;

  let title = dir.title;
  let assignees: string[] = [];
  let assignment: any = null;

  if (assignmentId) {
    assignment = (dir.assignments ?? []).find((a: any) => String(a._id) === String(assignmentId));
    if (!assignment) return json({ error: "분배 항목을 찾을 수 없습니다." }, 404);
    if (assignment.taskId) return json({ error: "이미 일정으로 등록된 항목입니다." }, 409);
    if (assignment.note) title = `${dir.title} · ${assignment.note}`;
    assignees = [String(assignment.userId)];
  } else {
    // TODO 전체 등록: 이미 등록됐으면 중복 방지
    if (dir.convertedTaskId) return json({ error: "이미 일정으로 등록된 TODO입니다." }, 409);
  }

  // 마감일이 있으면 그 날, 없으면 오늘 (allDay 일정)
  const day = dir.dueDate ? new Date(dir.dueDate) : new Date();
  const dateOnly = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));

  const task = await Task.create({
    title,
    description: dir.body || "",
    teamIds: [dir.teamId],
    assignees,
    createdBy: user.id,
    startDate: dateOnly,
    endDate: dateOnly,
    allDay: true,
    priority: dir.priority,
  });

  // 원자적 연결 — 동시 클릭 시 taskId/convertedTaskId가 이미 채워졌으면 지고,
  // 진 쪽은 방금 만든 일정을 지워 중복 등록을 막는다.
  const claim = assignment
    ? await Directive.findOneAndUpdate(
        { _id: params.id, assignments: { $elemMatch: { _id: assignmentId, taskId: null } } },
        { $set: { "assignments.$.taskId": task._id } }
      )
    : await Directive.findOneAndUpdate(
        { _id: params.id, convertedTaskId: null },
        { $set: { convertedTaskId: task._id } }
      );
  if (!claim) {
    await Task.deleteOne({ _id: task._id });
    return json({ error: "이미 일정으로 등록되었습니다." }, 409);
  }

  await logActivity({ actorId: user.id, actorName: user.name, action: "create", targetTitle: task.title });

  // 담당 팀원에게 알림 (등록한 본인 제외)
  await notify(assignees.filter((a) => a !== user.id), {
    type: "task_assigned",
    title: "TODO가 내 일정으로 등록됐어요",
    body: title,
    link: `/calendar?task=${String(task._id)}`,
  });

  return json({ taskId: String(task._id) }, 201);
}
