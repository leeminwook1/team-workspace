import { User } from "@/models/User";
import { Task } from "@/models/Task";
import { notify } from "./notify";
import { esc, editTelegramMessage, sendTelegramWithId, telegramEnabled, type TgButton } from "./telegram";

// 모임 참석 확인 — 대상은 과원 전체(과장·부과장·과원). 응답: 참석·불참·미정.
// 텔레그램은 [참석][불참][미정] 버튼으로 바로 응답하고, 다시 눌러 바꿀 수 있다.

export type RsvpStatus = "yes" | "no" | "maybe";
export const RSVP_STATUSES: RsvpStatus[] = ["yes", "no", "maybe"];
export const RSVP_LABEL: Record<RsvpStatus, string> = { yes: "참석", no: "불참", maybe: "미정" };
export const RSVP_EMOJI: Record<RsvpStatus, string> = { yes: "✅", no: "❌", maybe: "🤔" };
const CODE: Record<string, RsvpStatus> = { y: "yes", n: "no", m: "maybe" };

/** 분류 이름에 "모임"이 들어가면 참석 확인 자동 켜기 */
export function isMeetingCategory(name?: string | null) {
  return !!name && name.includes("모임");
}

/** 참석 확인 대상 = 활성 과원 전체 (부장단·시스템 관리자 제외) */
export async function rsvpTargetIds(): Promise<string[]> {
  const us: any[] = await User.find({ status: "active", role: { $in: ["leader", "vice_leader", "member"] } }).select("_id").lean();
  return us.map((u) => String(u._id));
}

/** 응답 마감 기본값 — 모임 전날 (KST 23:59) */
export function defaultRsvpDeadline(start: Date) {
  const KST = 9 * 3600_000;
  const k = new Date(new Date(start).getTime() + KST);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - 1, 23, 59) - KST);
}

export function rsvpButtons(taskId: string): TgButton[][] {
  return [[
    { text: "✅ 참석", data: `rsvp:${taskId}:y` },
    { text: "❌ 불참", data: `rsvp:${taskId}:n` },
    { text: "🤔 미정", data: `rsvp:${taskId}:m` },
  ]];
}
export function parseRsvpCode(c: string | undefined): RsvpStatus | null {
  return (c && CODE[c]) || null;
}

const KST = 9 * 3600_000;
function whenText(t: any) {
  const k = new Date(new Date(t.startDate).getTime() + KST);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][k.getUTCDay()];
  const date = `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${wd})`;
  return t.allDay ? date : `${date} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

/** 텔레그램 메시지 본문 — 모임 정보 + 응답 인원수 + 받는 사람의 내 응답 */
export function rsvpMessageText(t: any, forUserId: string, opts?: { reminder?: boolean }) {
  const head = !t.rsvp?.on
    ? `🙋 <b>참석 확인 — ${esc(t.title)}</b> (마감됨)`
    : opts?.reminder
      ? `🙋 <b>아직 참석 여부를 안 알려주셨어요 — ${esc(t.title)}</b>`
      : `🙋 <b>참석 여부를 알려주세요 — ${esc(t.title)}</b>`;
  const lines = [head, `🗓 ${whenText(t)}${t.location ? ` · 📍 ${esc(t.location)}` : ""}`];
  if (t.rsvp?.deadline && t.rsvp?.on) lines.push(`⏰ ${whenText({ startDate: t.rsvp.deadline, allDay: true })}까지 알려주세요`);

  // 현황은 인원수만 — 이름 명단은 웹 일정(달력·상세)에서 확인
  const targets: string[] = (t.rsvp?.targets ?? []).map(String);
  const resp = new Map<string, any>((t.rsvp?.responses ?? []).filter((r: any) => targets.includes(String(r.userId))).map((r: any) => [String(r.userId), r]));
  const cnt = (s: RsvpStatus) => Array.from(resp.values()).filter((r: any) => r.status === s).length;
  const maybe = cnt("maybe");
  lines.push("", `✅ 참석 ${cnt("yes")} · ❌ 불참 ${cnt("no")}${maybe ? ` · 🤔 미정 ${maybe}` : ""} · ⏳ 미응답 ${targets.length - resp.size}`);

  const mine = resp.get(forUserId)?.status as RsvpStatus | undefined;
  if (t.rsvp?.on) lines.push("", mine ? `➡️ 내 응답: <b>${RSVP_EMOJI[mine]} ${RSVP_LABEL[mine]}</b> (바꾸려면 다른 버튼)` : "➡️ 아래 버튼으로 응답해 주세요");
  return lines.join("\n");
}

function rsvpTgButtons(taskId: string): TgButton[][] {
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  return [...rsvpButtons(taskId), ...(base ? [[{ text: "🔗 웹에서 보기", url: `${base}/calendar?task=${taskId}` }]] : [])];
}


/** 참석 확인 요청 (처음 켤 때·재알림) — 앱 알림 + 텔레그램(현황이 담긴 메시지, 이후 고쳐 쓰기용으로 번호 저장) */
export async function sendRsvpRequest(t: any, userIds: string[], opts?: { reminder?: boolean }) {
  if (userIds.length === 0) return;
  const deadline = t.rsvp?.deadline ? `\n⏰ ${whenText({ startDate: t.rsvp.deadline, allDay: true })}까지 알려주세요` : "";
  await notify(userIds, {
    type: "rsvp",
    title: opts?.reminder ? `🙋 아직 참석 여부를 안 알려주셨어요 — ${t.title}` : `🙋 참석 여부를 알려주세요 — ${t.title}`,
    body: `🗓 ${whenText(t)}${t.location ? ` · 📍 ${t.location}` : ""}${deadline}`,
    link: `/calendar?task=${String(t._id)}`,
  }, { skipTelegram: true });

  if (!telegramEnabled()) return;
  const linked: any[] = await User.find({ _id: { $in: userIds }, telegramChatId: { $nin: ["", null] } }).select("telegramChatId").lean();
  if (linked.length === 0) return;
  const sent: { userId: string; chatId: string; messageId: number }[] = [];
  await Promise.allSettled(linked.map(async (u) => {
    const uid = String(u._id);
    const mid = await sendTelegramWithId(u.telegramChatId, rsvpMessageText(t, uid, opts), { html: true, buttons: rsvpTgButtons(String(t._id)) });
    if (mid) sent.push({ userId: uid, chatId: u.telegramChatId, messageId: mid });
  }));
  if (sent.length) await Task.updateOne({ _id: t._id }, { $push: { "rsvp.tgMessages": { $each: sent } } });
}

/** 응답·마감·끄기 후 — 보낸 모든 텔레그램 메시지를 최신 현황으로 고쳐 쓴다 (각자 '내 응답' 포함) */
export async function refreshRsvpMessages(taskId: string, extra?: { chatId: string; messageId: number; userId: string }) {
  if (!telegramEnabled()) return;
  const t: any = await Task.findById(taskId).lean();
  if (!t) return;
  const msgs: { userId: string; chatId: string; messageId: number }[] = (t.rsvp?.tgMessages ?? [])
    .map((m: any) => ({ userId: String(m.userId), chatId: m.chatId, messageId: m.messageId }));
  // 이 기능 이전에 보낸 메시지(번호 미저장)를 눌렀다면 그 메시지도 함께 갱신
  if (extra && !msgs.some((m) => m.chatId === extra.chatId && m.messageId === extra.messageId)) msgs.push(extra);
  if (msgs.length === 0) return;
  const buttons = t.rsvp?.on ? rsvpTgButtons(String(t._id)) : undefined; // 끈 뒤에는 버튼 제거
  await Promise.allSettled(msgs.map((m) =>
    editTelegramMessage(m.chatId, m.messageId, rsvpMessageText(t, m.userId), { html: true, buttons })
  ));
}

/** 응답 기록 (있으면 덮어씀). 대상이 아니던 과원이 응답하면 대상에 추가 */
export function applyResponse(task: any, userId: string, status: RsvpStatus, reason?: string) {
  if (!task.rsvp.targets.some((x: any) => String(x) === userId)) task.rsvp.targets.push(userId);
  const r = task.rsvp.responses.find((x: any) => String(x.userId) === userId);
  const clean = status === "yes" ? "" : (reason ?? r?.reason ?? "").trim().slice(0, 200);
  if (r) { r.status = status; r.reason = clean; r.at = new Date(); }
  else task.rsvp.responses.push({ userId, status, reason: clean, at: new Date() });
  // 응답·대상만 저장 — 동시에 기록되는 텔레그램 메시지 번호(tgMessages)를 덮어쓰지 않게
  task.markModified("rsvp.responses");
  task.markModified("rsvp.targets");
}

/** 목록·달력용 요약 */
export function rsvpSummary(rsvp: any, meId?: string, nameById?: Map<string, string>) {
  if (!rsvp?.on) return null;
  const targets = (rsvp.targets ?? []).map(String);
  const resp = (rsvp.responses ?? []).filter((r: any) => targets.includes(String(r.userId)));
  const count = (s: RsvpStatus) => resp.filter((r: any) => r.status === s).length;
  const mine = meId ? resp.find((r: any) => String(r.userId) === meId)?.status ?? null : null;
  return {
    on: true,
    deadline: rsvp.deadline ?? null,
    total: targets.length,
    yes: count("yes"), no: count("no"), maybe: count("maybe"),
    none: targets.length - resp.length,
    isTarget: !!meId && targets.includes(meId),
    mine: mine as RsvpStatus | null,
    // 참석 응답한 사람 이름 (응답 순) — 달력 칸 표시용, 이름 맵을 넘긴 경우만
    yesNames: nameById
      ? resp.filter((r: any) => r.status === "yes").sort((a: any, b: any) => new Date(a.at).getTime() - new Date(b.at).getTime())
          .map((r: any) => nameById.get(String(r.userId))).filter(Boolean) as string[]
      : undefined,
  };
}
