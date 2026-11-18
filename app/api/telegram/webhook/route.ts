import { NextResponse } from "next/server";
import { routeMessage, routeCallback } from "@/lib/tgRouter";

// POST /api/telegram/webhook — 텔레그램 봇이 받은 메시지·버튼 콜백 수신 (setWebhook으로 등록)
// 보안: setWebhook 시 지정한 secret_token이 X-Telegram-Bot-Api-Secret-Token 헤더로 와야 처리.
// 처리 분배는 lib/tgRouter (명령·사진·그냥 쓰기·버튼).
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    // 시크릿 미설정 상태로 웹훅을 열어두지 않는다 (위조 요청으로 일정·예약 생성 방지)
    if (process.env.NODE_ENV === "production") return NextResponse.json({ ok: true });
  } else if (req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: true }); // 위조 요청 — 조용히 무시 (텔레그램 재시도 방지 위해 200)
  }

  const update = await req.json().catch(() => null);

  // 인라인 버튼 콜백
  const cb = update?.callback_query;
  if (cb?.id && cb.message?.chat?.id && typeof cb.data === "string") {
    try {
      await routeCallback({
        fromId: String(cb.from?.id ?? ""),
        chatId: String(cb.message.chat.id),
        messageId: cb.message.message_id,
        messageText: cb.message.text ?? "",
        data: cb.data,
        callbackId: String(cb.id),
      });
    } catch (e) {
      console.error("[telegram webhook] 콜백 처리 오류:", (e as Error)?.message);
    }
    return NextResponse.json({ ok: true });
  }

  // 메시지 — / 명령(그룹방 포함), 1:1 대화방의 사진·일반 문장
  if (update?.message) {
    try {
      await routeMessage(update.message);
    } catch (e) {
      console.error("[telegram webhook] 처리 오류:", (e as Error)?.message);
    }
  }

  // 텔레그램은 200이 아니면 계속 재전송하므로 항상 200
  return NextResponse.json({ ok: true });
}
