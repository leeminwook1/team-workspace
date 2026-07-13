import { NextResponse } from "next/server";
import { handleTelegramCommand, handleTelegramCallback } from "@/lib/telegramCommands";
import { sendTelegram } from "@/lib/telegram";

// POST /api/telegram/webhook — 텔레그램 봇이 받은 메시지·버튼 콜백 수신 (setWebhook으로 등록)
// 보안: setWebhook 시 지정한 secret_token이 X-Telegram-Bot-Api-Secret-Token 헤더로 와야 처리.
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    // 시크릿 미설정 상태로 웹훅을 열어두지 않는다 (위조 요청으로 일정·예약 생성 방지)
    if (process.env.NODE_ENV === "production") return NextResponse.json({ ok: true });
  } else if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: true }); // 위조 요청 — 조용히 무시 (텔레그램 재시도 방지 위해 200)
  }

  const update = await req.json().catch(() => null);

  // 인라인 버튼 콜백 — 완료·등록 취소·예약 취소·반납 처리
  const cb = update?.callback_query;
  if (cb?.id && cb.message?.chat?.id && typeof cb.data === "string") {
    try {
      await handleTelegramCallback({
        fromId: String(cb.from?.id ?? ""),
        chatId: String(cb.message.chat.id),
        messageId: cb.message.message_id,
        messageText: cb.message.text ?? "",
        data: cb.data,
        callbackId: String(cb.id),
      });
    } catch (e) {
      console.error("[telegram webhook] 콜백 처리 오류:", e);
    }
    return NextResponse.json({ ok: true });
  }

  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const text = msg?.text;

  // 텍스트 명령만 처리 (사진·스티커 등 무시). 그룹방에서는 보낸 사람 개인 ID로 계정 식별.
  if (chatId && typeof text === "string" && text.startsWith("/")) {
    try {
      const reply = await handleTelegramCommand(String(chatId), text, msg?.from?.id ? String(msg.from.id) : undefined);
      if (typeof reply === "string") {
        if (reply) await sendTelegram(String(chatId), reply);
      } else if (reply?.text) {
        await sendTelegram(String(chatId), reply.text, { html: reply.html, buttons: reply.buttons });
      }
    } catch (e) {
      console.error("[telegram webhook] 처리 오류:", e);
    }
  }

  // 텔레그램은 200이 아니면 계속 재전송하므로 항상 200
  return NextResponse.json({ ok: true });
}
