import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import { requireActiveUser, json } from "@/lib/api";
import { canEditTaskAny, canDeleteTaskAny, canChangeStatusAny } from "@/lib/permissions";
import { taskUpdateSchema } from "@/lib/validations";

// PATCH /api/tasks/:id — 수정(팀장·부팀장·과장·부과장) / 팀원은 본인 담당 업무의 status만
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const task: any = await Task.findById(params.id);
  if (!task) return json({ error: "업무를 찾을 수 없습니다." }, 404);

  const teamIds = (task.teamIds ?? []).map((t: any) => String(t));
  const assigneeIds = (task.assignees ?? []).map((a: any) => String(a));
  const d = parsed.data;
  const keys = Object.keys(d);
  const statusOnly = keys.length === 1 && keys[0] === "status";

  if (canEditTaskAny(user, teamIds)) {
    // 전체 필드 수정 가능 (업무의 팀 중 하나라도 편집 권한)
  } else if (statusOnly && canChangeStatusAny(user, teamIds, assigneeIds)) {
    // 팀원: 본인 담당 업무의 상태만 (설계 3.2)
  } else {
    return json({ error: "이 업무를 수정할 권한이 없습니다." }, 403);
  }

  if (d.title !== undefined) task.title = d.title;
  if (d.description !== undefined) task.description = d.description;
  if (d.teamIds !== undefined) task.teamIds = d.teamIds;
  if (d.assignees !== undefined) task.assignees = d.assignees;
  if (d.startDate !== undefined) task.startDate = new Date(d.startDate);
  if (d.endDate !== undefined) task.endDate = new Date(d.endDate);
  if (d.allDay !== undefined) task.allDay = d.allDay;
  if (d.status !== undefined) task.status = d.status;
  if (d.priority !== undefined) task.priority = d.priority;
  if (d.location !== undefined) task.location = d.location;

  if (task.endDate < task.startDate) {
    return json({ error: "종료일이 시작일보다 빠를 수 없습니다." }, 400);
  }

  await task.save();
  return json({ id: String(task._id) });
}

// DELETE /api/tasks/:id — 삭제는 팀장·Admin만 (설계 확정)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const task: any = await Task.findById(params.id).lean();
  if (!task) return json({ error: "업무를 찾을 수 없습니다." }, 404);

  const teamIds = (task.teamIds ?? []).map((t: any) => String(t));
  if (!canDeleteTaskAny(user, teamIds)) {
    return json({ error: "삭제는 팀장 또는 최고관리자만 가능합니다." }, 403);
  }

  await Task.deleteOne({ _id: params.id });
  return json({ deleted: true });
}
