import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { Team } from "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { canApproveUsers } from "@/lib/permissions";
import { approveSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { ROLE_LABEL } from "@/lib/permissions";

// POST /api/admin/users/:id/approve — 승인 + 팀·역할 배정 (설계 5.3)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canApproveUsers(user)) return json({ error: "승인 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const { role, teamId } = parsed.data;
  const isOrgRole = ["admin", "manager", "deputy", "secretary"].includes(role);

  // 전사 역할(과장/부과장/서기/admin) 부여는 최고관리자만 가능
  if (isOrgRole && user.role !== "admin") {
    return json({ error: "전사 역할 부여는 최고관리자만 가능합니다." }, 403);
  }

  await connectDB();
  const target: any = await User.findById(params.id);
  if (!target) return json({ error: "사용자를 찾을 수 없습니다." }, 404);
  if (target.status !== "pending") return json({ error: "승인 대기 상태가 아닙니다." }, 400);

  // 팀 소속 역할이면 실제 존재하는 팀인지 검증 — 없는 팀에 배정돼 팀 스코프 쿼리에서 사라지는 것 방지
  if (!isOrgRole) {
    if (!teamId || !mongoose.isValidObjectId(teamId) || !(await Team.countDocuments({ _id: teamId }))) {
      return json({ error: "선택한 팀을 찾을 수 없습니다." }, 400);
    }
  }

  target.role = role;
  target.teamId = isOrgRole ? null : teamId;
  target.status = "active";
  await target.save();

  await logActivity({ actorId: user.id, actorName: user.name, action: "approve", targetType: "user", targetTitle: target.name });
  await notify([String(target._id)], {
    type: "approved",
    title: "가입이 승인되었어요",
    body: `${ROLE_LABEL[role] ?? role} 역할로 활동을 시작할 수 있어요.`,
    link: "/home",
  });
  return json({ approved: true });
}
