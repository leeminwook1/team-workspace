import { connectDB } from "./mongodb";
import { Notification } from "@/models/Notification";
import { User } from "@/models/User";
import { sendTelegramMany, telegramEnabled } from "./telegram";

// 알림 생성 헬퍼 — 앱 내 알림 + (연동된 사용자에겐) 텔레그램 전송.
// 실패해도 호출한 작업(승인·업무 등록 등)을 막지 않는다.
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

    // 텔레그램 — 챗 ID를 등록한 사용자에게만 (봇 토큰 미설정이면 전체 스킵)
    if (telegramEnabled()) {
      const linked: any[] = await User.find({
        _id: { $in: ids },
        telegramChatId: { $nin: ["", null] },
      }).select("telegramChatId").lean();
      if (linked.length > 0) {
        const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
        const text = [`🔔 ${n.title}`, n.body, n.link && base ? `${base}${n.link}` : ""]
          .filter(Boolean)
          .join("\n");
        await sendTelegramMany(linked.map((u) => u.telegramChatId), text);
      }
    }
  } catch (e) {
    console.error("[notify] 알림 생성 실패:", e);
  }
}
