// 텔레그램 봇 전송 유틸 — TELEGRAM_BOT_TOKEN 환경변수가 있어야 동작 (없으면 조용히 no-op).
// 알림 전송 실패가 원래 작업(승인·업무 등록 등)을 막지 않도록 절대 throw하지 않는다.

const API = "https://api.telegram.org";

export function telegramEnabled() {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

/** HTML parse_mode용 이스케이프 — 제목·이름 등 사용자 입력을 안전하게 포함 */
export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 인라인 버튼 — data(콜백) 또는 url(링크) 중 하나
export type TgButton = { text: string; data?: string; url?: string };
export type TgSendOpts = { html?: boolean; buttons?: TgButton[][] };

function replyMarkup(buttons?: TgButton[][]) {
  if (!buttons || buttons.length === 0) return undefined;
  return {
    inline_keyboard: buttons.map((row) =>
      row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data ?? "" }))
    ),
  };
}

/** 공통 API 호출 — 5초 타임아웃, 실패 시 false (throw하지 않음) */
async function tgCall(method: string, payload: Record<string, unknown>): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[telegram] ${method} 실패 (${res.status}):`, body.slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[telegram] ${method} 오류:`, e);
    return false;
  }
}

/** 단건 전송 — 성공 여부 반환 */
export async function sendTelegram(chatId: string, text: string, opts?: TgSendOpts): Promise<boolean> {
  if (!chatId) return false;
  const markup = replyMarkup(opts?.buttons);
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(opts?.html ? { parse_mode: "HTML" } : {}),
    ...(markup ? { reply_markup: markup } : {}),
  });
}

/** 여러 명에게 전송 — 개별 실패는 무시 */
export async function sendTelegramMany(chatIds: string[], text: string, opts?: TgSendOpts) {
  if (!telegramEnabled() || chatIds.length === 0) return;
  await Promise.allSettled(chatIds.map((id) => sendTelegram(id, text, opts)));
}

/** 버튼 콜백 응답 — 누른 사람에게 토스트 표시 (10초 내 응답 필요) */
export async function answerCallback(callbackId: string, text?: string) {
  return tgCall("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text } : {}) });
}

/** 보낸 메시지 수정 — 버튼 처리 결과를 원본 메시지에 반영 (버튼 미전달 시 제거됨) */
export async function editTelegramMessage(chatId: string, messageId: number, text: string, opts?: TgSendOpts) {
  const markup = replyMarkup(opts?.buttons);
  return tgCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    ...(opts?.html ? { parse_mode: "HTML" } : {}),
    ...(markup ? { reply_markup: markup } : {}),
  });
}

/** 봇 명령 메뉴 등록 — 텔레그램 규격상 명령어는 영문 소문자·숫자·_만 허용 */
export async function setBotCommands(commands: { command: string; description: string }[]) {
  return tgCall("setMyCommands", { commands });
}
