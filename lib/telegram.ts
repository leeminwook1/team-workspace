// 텔레그램 봇 전송 유틸 — TELEGRAM_BOT_TOKEN 환경변수가 있어야 동작 (없으면 조용히 no-op).
// 알림 전송 실패가 원래 작업(승인·업무 등록 등)을 막지 않도록 절대 throw하지 않는다.

const API = "https://api.telegram.org";

export function telegramEnabled() {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

/** 단건 전송 — 성공 여부 반환. 5초 타임아웃. */
export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[telegram] 전송 실패 (${res.status}):`, body.slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[telegram] 전송 오류:", e);
    return false;
  }
}

/** 여러 명에게 전송 — 개별 실패는 무시 */
export async function sendTelegramMany(chatIds: string[], text: string) {
  if (!telegramEnabled() || chatIds.length === 0) return;
  await Promise.allSettled(chatIds.map((id) => sendTelegram(id, text)));
}
