import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";

// POST /api/me/telegram-code — 텔레그램 연동 코드 발급 (10분 유효)
// 발급받은 코드를 봇에게 "/연동 <코드>"로 보내면 챗 ID가 자동 연결된다.
export async function POST() {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const code = String(crypto.randomInt(100000, 1000000)); // 6자리
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await User.updateOne({ _id: user.id }, { $set: { tgLinkCode: code, tgLinkCodeExp: expiresAt } });

  return json({ code, expiresAt });
}
