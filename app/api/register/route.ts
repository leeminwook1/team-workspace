import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { registerSchema } from "@/lib/validations";
import { json } from "@/lib/api";

// 설계 5.3 — 자유가입 + 관리자 승인제: 가입 즉시 status "pending"
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }
  const { name, email, password } = parsed.data;

  await connectDB();
  const exists = await User.findOne({ email: email.toLowerCase() }).lean();
  if (exists) return json({ error: "이미 가입 신청된 이메일입니다." }, 409);

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({ name, email, passwordHash, status: "pending" });

  return json({ message: "가입 신청 완료. 관리자 승인 후 이용할 수 있습니다." }, 201);
}
