import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { Team } from "@/models/Team";
import { requireActiveUser, json, badId } from "@/lib/api";
import { canApproveUsers, canManageTeams } from "@/lib/permissions";
import { userUpdateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";

// PATCH /api/admin/users/:id — 활성 사용자의 팀·역할·전사역할·활성상태 변경 (설계 7장: 권한변경=Admin)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
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

  if (d.role !== undefined) {
    const isOrgRole = ["admin", "manager", "deputy", "secretary"].includes(d.role);
    if (isOrgRole) {
      target.role = d.role;
      target.teamId = null;
    } else {
      // 팀 역할: teamId 필요 (요청값 또는 기존값)
      const tid = d.teamId ?? (target.teamId ? String(target.teamId) : null);
      if (!tid) return json({ error: "팀 역할은 소속 팀을 선택해야 합니다." }, 400);
      const found = await Team.countDocuments({ _id: tid });
      if (!found) return json({ error: "존재하지 않는 팀입니다." }, 400);
      target.role = d.role;
      target.teamId = tid;
    }
  } else if (d.teamId !== undefined) {
    // 역할 변경 없이 팀만 변경
    if (d.teamId) {
      const found = await Team.countDocuments({ _id: d.teamId });
      if (!found) return json({ error: "존재하지 않는 팀입니다." }, 400);
    }
    target.teamId = d.teamId || null;
  }
  if (d.status) target.status = d.status;

  await target.save();
  await logActivity({
    actorId: user.id, actorName: user.name, action: "update", targetType: "user",
    targetTitle: target.name, meta: { detail: "역할·팀·상태 변경" },
  });
  return json({ updated: true });
}

// DELETE /api/admin/users/:id — 사용자 삭제
// pending 거절: 과장·부과장·admin / 활성·비활성 계정 삭제: admin만, 본인 불가
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const target: any = await User.findById(params.id).lean();
  if (!target) return json({ error: "사용자를 찾을 수 없습니다." }, 404);

  if (target.status === "pending") {
    if (!canApproveUsers(user)) return json({ error: "권한이 없습니다." }, 403);
  } else {
    if (!canManageTeams(user)) return json({ error: "계정 삭제는 최고관리자만 가능합니다." }, 403);
    if (String(target._id) === user.id) return json({ error: "본인 계정은 삭제할 수 없습니다." }, 400);
  }

  await User.deleteOne({ _id: params.id });
  await logActivity({
    actorId: user.id, actorName: user.name, action: "delete", targetType: "user",
    targetTitle: target.name, meta: { detail: target.status === "pending" ? "가입 거절" : "계정 삭제" },
  });
  return json({ deleted: true });
}
