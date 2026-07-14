import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";

// POST /api/me/ical-token — iCal 구독 토큰 발급/재발급 (재발급하면 이전 URL은 무효)
export async function POST() {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const token = crypto.randomBytes(20).toString("hex");
  await User.updateOne({ _id: user.id }, { $set: { icalToken: token } });
  return json({ token });
}

// DELETE /api/me/ical-token — 구독 해제 (토큰 삭제, 기존 URL 즉시 무효)
export async function DELETE() {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  await User.updateOne({ _id: user.id }, { $set: { icalToken: "" } });
  return json({ ok: true });
}
