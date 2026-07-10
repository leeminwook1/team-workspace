import { connectDB } from "@/lib/mongodb";
import { Directive } from "@/models/Directive";
import { Task } from "@/models/Task";
import { requireActiveUser, json } from "@/lib/api";
import { canManageDirective } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

// POST /api/directives/:id/convert — 지시(또는 분배 항목)를 달력 일정으로 등록
// body: { assignmentId?: string } — 있으면 해당 팀원 담당 일정, 없으면 지시 전체를 팀 일정으로
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const dir: any = await Directive.findById(params.id);
  if (!dir) return json({ error: "지시를 찾을 수 없습니다." }, 404);
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
    // 지시 전체 등록: 이미 등록됐으면 중복 방지
    if (dir.convertedTaskId) return json({ error: "이미 일정으로 등록된 지시입니다." }, 409);
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

  if (assignment) {
    assignment.taskId = task._id;
    await dir.save();
  } else {
    dir.convertedTaskId = task._id;
    await dir.save();
  }

  await logActivity({ actorId: user.id, actorName: user.name, action: "create", targetTitle: task.title });
  return json({ taskId: String(task._id) }, 201);
}
