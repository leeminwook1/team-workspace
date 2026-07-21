import { connectDB } from "./mongodb";
import { User } from "@/models/User";
import { sendTelegramMany, telegramEnabled, esc } from "./telegram";

// 오류 알림 — 관리자(admin) 중 텔레그램을 연동한 사람에게 전송.
// 같은 종류(key)의 오류는 인스턴스당 10분에 1번만 보내 알림 폭주를 막는다.
// (서버리스라 인스턴스별 카운트지만, 스팸을 늦추는 데는 충분)
// 절대 throw하지 않는다 — 알림 실패가 본래 흐름을 막으면 안 된다.

const THROTTLE_MS = 10 * 60_000;
const lastSent = new Map<string, number>();

export async function alertAdmins(key: string, text: string) {
  try {
    if (!telegramEnabled()) return;
    const now = Date.now();
    const last = lastSent.get(key) ?? 0;
    if (now - last < THROTTLE_MS) return;
    lastSent.set(key, now);
    // 맵 청소 — 오래된 키 정리 (누수 방지)
    if (lastSent.size > 200) {
      lastSent.forEach((t, k) => { if (now - t > THROTTLE_MS) lastSent.delete(k); });
    }

    await connectDB();
    const admins: any[] = await User.find({
      role: "admin", status: "active",
      telegramChatId: { $nin: ["", null] },
    }).select("telegramChatId").lean();
    if (admins.length === 0) return;

    await sendTelegramMany(admins.map((a) => a.telegramChatId), text, { html: true });
  } catch (e) {
    console.error("[errorAlert] 관리자 알림 실패:", e);
  }
}

/** 오류 리포트용 공통 포맷 — 제목/본문을 이스케이프해 안전하게 */
export function formatErrorAlert(args: { kind: string; message: string; detail?: string; userName?: string }) {
  const lines = [
    `🚨 <b>오류 감지 — ${esc(args.kind)}</b>`,
    esc(args.message.slice(0, 300)),
  ];
  if (args.detail) lines.push(`<i>${esc(args.detail.slice(0, 200))}</i>`);
  if (args.userName) lines.push(`👤 ${esc(args.userName)}`);
  return lines.join("\n");
}
