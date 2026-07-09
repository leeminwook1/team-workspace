import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { Team } from "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { canApproveUsers, canManageTeams } from "@/lib/permissions";
import { userUpdateSchema } from "@/lib/validations";

// PATCH /api/admin/users/:id — 활성 사용자의 팀·역할·전사역할·활성상태 변경 (설계 7장: 권한변경=Admin)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한 변경은 최고관리자만 가능합니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
  const d = parsed.data;

  await connectDB();
  const target: any = await User.findById(params.id);
  if (!target) return json({ error: "사용자를 찾을 수 없습니다." }, 404);
  if (target.status === "pending") {
    return json({ error: "승인 대기 사용자는 가입 승인 화면에서 처리하세요." }, 400);
  }
  if (String(target._id) === user.id && d.status === "disabled") {
    return json({ error: "본인 계정은 비활성화할 수 없습니다." }, 400);
  }

  if (d.teams) {
    const ids = d.teams.map((t) => t.teamId);
    const found = await Team.countDocuments({ _id: { $in: ids } });
    if (found !== new Set(ids).size) return json({ error: "존재하지 않는 팀이 포함되어 있습니다." }, 400);
    target.teams = d.teams;
  }
  if (d.orgRole !== undefined) target.orgRole = d.orgRole ?? undefined;
  if (d.status) target.status = d.status;

  await target.save();
  return json({ updated: true });
}

// DELETE /api/admin/users/:id — 가입 신청 거절 (pending만 삭제 가능)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canApproveUsers(user)) return json({ error: "권한이 없습니다." }, 403);

  await connectDB();
  const target: any = await User.findById(params.id).lean();
  if (!target) return json({ error: "사용자를 찾을 수 없습니다." }, 404);
  if (target.status !== "pending") {
    return json({ error: "승인 대기 사용자만 거절(삭제)할 수 있습니다." }, 400);
  }

  await User.deleteOne({ _id: params.id });
  return json({ rejected: true });
}
