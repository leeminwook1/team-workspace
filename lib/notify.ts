import { connectDB } from "./mongodb";
import { Notification } from "@/models/Notification";
import { User } from "@/models/User";
import { sendTelegram, telegramEnabled, esc, type TgButton } from "./telegram";

// 알림 타입 → 텔레그램 수신 설정 키 (설정에서 끈 항목은 텔레그램 발송 생략)
const PREF_KEY: Record<string, "assign" | "due" | "directive" | "equip"> = {
  task_assigned: "assign",
  event_assigned: "assign",
  due: "due",
  directive: "directive",
  reservation: "equip",
};

// 알림 생성 헬퍼 — 앱 내 알림 + (연동된 사용자에겐) 텔레그램 전송.
// 실패해도 호출한 작업(승인·업무 등록 등)을 막지 않는다.
export async function notify(
  userIds: (string | { toString(): string })[],
  n: { type?: string; title: string; body?: string; link?: string },
  opts?: { tgButtons?: TgButton[][] } // 텔레그램 전용 인라인 버튼 (예: 완료·반납 처리)
) {
  const ids = Array.from(new Set(userIds.map(String))).filter(Boolean);
  if (ids.length === 0) return;
  try {
    await connectDB();
    await Notification.insertMany(
      ids.map((userId) => ({ userId, type: n.type ?? "info", title: n.title, body: n.body ?? "", link: n.link ?? "" }))
    );

    // 텔레그램 — 챗 ID를 등록했고 이 알림 타입을 끄지 않은 사용자에게만
    if (telegramEnabled()) {
      const linked: any[] = await User.find({
        _id: { $in: ids },
        telegramChatId: { $nin: ["", null] },
      }).select("telegramChatId notifyPrefs").lean();
      const prefKey = PREF_KEY[n.type ?? ""];
      const targets = prefKey ? linked.filter((u) => u.notifyPrefs?.[prefKey] !== false) : linked;
      if (targets.length > 0) {
        const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
        const text = [`🔔 <b>${esc(n.title)}</b>`, n.body ? esc(n.body) : ""].filter(Boolean).join("\n");
        const buttons: TgButton[][] = [...(opts?.tgButtons ?? [])];
        if (n.link && base) buttons.push([{ text: "🔗 웹에서 보기", url: `${base}${n.link}` }]);
        await Promise.allSettled(
          targets.map((u) =>
            sendTelegram(u.telegramChatId, text, { html: true, buttons: buttons.length ? buttons : undefined })
          )
        );
      }
    }
  } catch (e) {
    console.error("[notify] 알림 생성 실패:", e);
  }
}
