import { connectDB } from "./mongodb";
import { Notification } from "@/models/Notification";

// 알림 생성 헬퍼 — 실패해도 호출한 작업(승인·업무 등록 등)을 막지 않는다.
export async function notify(
  userIds: (string | { toString(): string })[],
  n: { type?: string; title: string; body?: string; link?: string }
) {
  const ids = Array.from(new Set(userIds.map(String))).filter(Boolean);
  if (ids.length === 0) return;
  try {
    await connectDB();
    await Notification.insertMany(
      ids.map((userId) => ({ userId, type: n.type ?? "info", title: n.title, body: n.body ?? "", link: n.link ?? "" }))
    );
  } catch (e) {
    console.error("[notify] 알림 생성 실패:", e);
  }
}
