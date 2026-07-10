import bcrypt from "bcryptjs";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

// 헷갈리는 문자(0/O, 1/l/I) 제외한 임시 비밀번호 생성
function generateTempPassword(len = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// POST /api/admin/users/:id/reset-password — 임시 비밀번호 발급 (최고관리자)
// 비밀번호를 잊은 사용자를 위해 관리자가 임시 비밀번호를 만들어 전달 → 본인이 로그인 후 '내 계정'에서 변경.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "임시 비밀번호 발급은 최고관리자만 가능합니다." }, 403);

  await connectDB();
  const target: any = await User.findById(params.id);
  if (!target) return json({ error: "사용자를 찾을 수 없습니다." }, 404);
  if (target.status === "pending") return json({ error: "승인 대기 사용자는 발급할 수 없습니다." }, 400);

  const tempPassword = generateTempPassword();
  target.passwordHash = await bcrypt.hash(tempPassword, 10);
  await target.save();

  await logActivity({
    actorId: user.id, actorName: user.name, action: "update", targetType: "user",
    targetTitle: target.name, meta: { detail: "임시 비밀번호 발급" },
  });

  // 평문은 이 응답에서 딱 한 번만 반환 (저장 안 함)
  return json({ tempPassword, name: target.name });
}
