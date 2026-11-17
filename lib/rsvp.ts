import { User } from "@/models/User";
import { notify } from "./notify";
import type { TgButton } from "./telegram";

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

/** 참석 확인 요청 (처음 켤 때·재알림) */
export async function sendRsvpRequest(t: any, userIds: string[], opts?: { reminder?: boolean }) {
  if (userIds.length === 0) return;
  const deadline = t.rsvp?.deadline ? `\n⏰ ${whenText({ startDate: t.rsvp.deadline, allDay: true })}까지 알려주세요` : "";
  await notify(userIds, {
    type: "rsvp",
    title: opts?.reminder ? `🙋 아직 참석 여부를 안 알려주셨어요 — ${t.title}` : `🙋 참석 여부를 알려주세요 — ${t.title}`,
    body: `🗓 ${whenText(t)}${t.location ? ` · 📍 ${t.location}` : ""}${deadline}`,
    link: `/calendar?task=${String(t._id)}`,
  }, { tgButtons: rsvpButtons(String(t._id)) });
}

/** 응답 기록 (있으면 덮어씀). 대상이 아니던 과원이 응답하면 대상에 추가 */
export function applyResponse(task: any, userId: string, status: RsvpStatus, reason?: string) {
  if (!task.rsvp.targets.some((x: any) => String(x) === userId)) task.rsvp.targets.push(userId);
  const r = task.rsvp.responses.find((x: any) => String(x.userId) === userId);
  const clean = status === "yes" ? "" : (reason ?? r?.reason ?? "").trim().slice(0, 200);
  if (r) { r.status = status; r.reason = clean; r.at = new Date(); }
  else task.rsvp.responses.push({ userId, status, reason: clean, at: new Date() });
  task.markModified("rsvp");
}

/** 목록·달력용 요약 */
export function rsvpSummary(rsvp: any, meId?: string) {
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
  };
}
