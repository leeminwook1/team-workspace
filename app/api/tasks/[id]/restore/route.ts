import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import { requireActiveUser, json, badId } from "@/lib/api";
import { canDeleteTaskDoc } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

// POST /api/tasks/:id/restore — 휴지통 복구 (삭제 권한과 동일: 팀장·본인·Admin)
// 연동됐던 장비 예약은 삭제 시 취소된 상태로 남는다 — 필요하면 일정 수정에서 다시 선택.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const task: any = await Task.findOne({ _id: params.id, deletedAt: { $ne: null } }).lean();
  if (!task) return json({ error: "휴지통에서 찾을 수 없습니다." }, 404);

  const teamIds = (task.teamIds ?? []).map((t: any) => String(t));
  if (!canDeleteTaskDoc(user, teamIds, task.createdBy ? String(task.createdBy) : null)) {
    return json({ error: "복구 권한이 없습니다. (팀장·최고관리자 또는 본인이 만든 일정)" }, 403);
  }

  await Task.updateOne({ _id: params.id }, { $set: { deletedAt: null } });
  await logActivity({ actorId: user.id, actorName: user.name, action: "update", targetTitle: `${task.title} (휴지통 복구)` });
  return json({ restored: true });
}
