import { handleTelegramCommand, handleTelegramCallback, type TgReply } from "./telegramCommands";
import { sendTelegram, answerCallback } from "./telegram";
import { connectDB } from "./mongodb";
import { findLinkedUser, NOT_LINKED } from "./tgUser";
import { getDraft } from "./tgDraft";
import { handlePipelineCallback } from "./tgPipeline";
import { handleReturnCallback, handleIssueText } from "./tgReturn";
import { handleQuickText, handleQuickCallback } from "./tgQuick";
import { handleBookSetCallback } from "./tgFree";
import { handlePhoto, handleAssignmentCallback } from "./tgPhoto";

// 텔레그램 업데이트 분배 — 웹훅은 여기만 부른다.
//  · / 명령 → telegramCommands
//  · 1:1 대화방의 사진 → 과제 제출 / 일반 문장 → (이상 내용 입력 대기면) 반납 이상 신고, 아니면 "그냥 쓰기" 등록
//  · 버튼 콜백 → 접두사별 모듈 (기존 접두사는 telegramCommands)

export async function sendReply(chatId: string, reply: TgReply) {
  if (typeof reply === "string") { if (reply) await sendTelegram(chatId, reply); return; }
  if (reply?.text) await sendTelegram(chatId, reply.text, { html: reply.html, buttons: reply.buttons });
}

export async function routeMessage(msg: any) {
  const chatId = msg?.chat?.id ? String(msg.chat.id) : "";
  const fromId = msg?.from?.id ? String(msg.from.id) : undefined;
  if (!chatId) return;
  const text: string | undefined = typeof msg.text === "string" ? msg.text : undefined;

  if (text?.startsWith("/")) {
    await sendReply(chatId, await handleTelegramCommand(chatId, text, fromId));
    return;
  }
  // 그룹방에서는 / 명령만 — 대화에 끼어들지 않는다
  if (!fromId || chatId !== fromId) return;
  const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
  if (!text && !hasPhoto) return; // 스티커·파일 등은 무시

  await connectDB();
  const linked = await findLinkedUser(fromId);
  if (!linked) { await sendTelegram(chatId, NOT_LINKED); return; }
  const user = linked.user;

  if (hasPhoto) { await sendReply(chatId, await handlePhoto(user, msg)); return; }
  const draft = await getDraft(user.id);
  if (draft?.kind === "issue") { await sendReply(chatId, await handleIssueText(user, draft, text!)); return; }
  await sendReply(chatId, await handleQuickText(user, text!));
}

const NEW_PREFIX = new Set(["pl", "rc", "rf", "ri", "rx", "ret", "qa", "bks", "asg"]);

export async function routeCallback(p: { fromId: string; chatId: string; messageId: number; messageText: string; data: string; callbackId: string }) {
  const prefix = p.data.split(":")[0];
  if (!NEW_PREFIX.has(prefix)) { await handleTelegramCallback(p); return; }
  await connectDB();
  const linked = await findLinkedUser(p.fromId);
  if (!linked) { await answerCallback(p.callbackId, "계정 연동이 필요해요. 설정에서 연동 후 이용해주세요."); return; }
  const ctx = { user: linked.user, chatId: p.chatId, messageId: p.messageId, callbackId: p.callbackId, data: p.data };
  try {
    if (prefix === "pl") return await handlePipelineCallback(ctx);
    if (prefix === "qa") return await handleQuickCallback(ctx);
    if (prefix === "bks") return await handleBookSetCallback({ ...ctx, messageText: p.messageText });
    if (prefix === "asg") return await handleAssignmentCallback(ctx);
    return await handleReturnCallback(ctx); // rc rf ri rx ret
  } catch (e) {
    console.error("[telegram] 콜백 처리 오류:", (e as Error)?.message);
    await answerCallback(p.callbackId, "처리 중 오류가 발생했어요.");
  }
}
