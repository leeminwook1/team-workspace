import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { Team } from "@/models/Team";
import { registerSchema } from "@/lib/validations";
import { json } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { getDeptId } from "@/lib/dept";

// 설계 5.3 — 자유가입 + 관리자 승인제: 가입 즉시 status "pending"
// 신청자가 희망 팀·역할을 함께 제출하면 승인 화면에 미리 선택되어 표시된다.
export async function POST(req: Request) {
  // 스팸 가입 방어 — IP당 1시간에 5회
  const rl = await rateLimit(`register:${clientIp(req.headers)}`, 5, 60 * 60 * 1000);
  if (!rl.ok) {
    return json({ error: "가입 신청이 너무 많습니다. 잠시 후 다시 시도해주세요." }, 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }
  const { name, email, password, teamId, role } = parsed.data;

  await connectDB();
  const exists = await User.findOne({ email: email.toLowerCase() }).lean();
  if (exists) return json({ error: "이미 가입 신청된 이메일입니다." }, 409);

  // 사진과 전용 — 신청자는 항상 과 소속 (희망 직급은 승인 화면에 미리 선택됨)
  void teamId;
  const validTeamId = await getDeptId();

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({ name, email, passwordHash, status: "pending", role, teamId: validTeamId });

  return json({ message: "가입 신청 완료. 관리자 승인 후 이용할 수 있습니다." }, 201);
}
