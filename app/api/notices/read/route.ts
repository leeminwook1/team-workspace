import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";

// POST /api/notices/read — 공지 목록을 열람했음을 기록 (lastNoticeReadAt = 지금).
// 이후 올라온 공지만 '안 읽음'으로 계산 — readBy 무제한 배열을 쓰지 않는다.
export async function POST() {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  await User.updateOne({ _id: user.id }, { $set: { lastNoticeReadAt: new Date() } });
  return json({ ok: true });
}
