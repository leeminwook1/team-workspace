import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import { User } from "@/models/User";
import { Task } from "@/models/Task";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";
import { teamSchema } from "@/lib/validations";

// PATCH /api/teams/:id — 팀 수정 (이름·색상·설명·활성화, Admin만)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "팀 수정 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = teamSchema.partial().safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const team: any = await Team.findById(params.id);
  if (!team) return json({ error: "팀을 찾을 수 없습니다." }, 404);

  if (parsed.data.slug && parsed.data.slug !== team.slug) {
    const dup = await Team.findOne({ slug: parsed.data.slug, _id: { $ne: params.id } }).lean();
    if (dup) return json({ error: "이미 존재하는 slug입니다." }, 409);
  }

  Object.assign(team, parsed.data);
  if (typeof body?.isActive === "boolean") team.isActive = body.isActive;
  await team.save();

  return json({ id: String(team._id) });
}

// DELETE /api/teams/:id — 팀 완전 삭제 (Admin). 사용 중이면 차단.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "팀 삭제 권한이 없습니다." }, 403);

  await connectDB();
  const team: any = await Team.findById(params.id).lean();
  if (!team) return json({ error: "팀을 찾을 수 없습니다." }, 404);

  const memberCount = await User.countDocuments({ teamId: params.id });
  const taskCount = await Task.countDocuments({ teamIds: params.id });
  if (memberCount > 0 || taskCount > 0) {
    return json(
      { error: `사용 중인 팀은 삭제할 수 없습니다. (소속 ${memberCount}명, 업무 ${taskCount}건) 먼저 비활성화하세요.` },
      409
    );
  }

  await Team.deleteOne({ _id: params.id });
  return json({ deleted: true });
}
