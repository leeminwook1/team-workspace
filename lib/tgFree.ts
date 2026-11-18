import { Resource } from "@/models/Resource";
import { ResourceSet } from "@/models/ResourceSet";
import { Reservation } from "@/models/Reservation";
import "@/models/ResourceCategory";
import { esc, answerCallback, editTelegramMessage, type TgButton } from "./telegram";
import { canReserve, type SessionUser } from "./permissions";
import { findConflicts, findUnavailableResources, postCreateGuard } from "./taskReservations";
import { logActivity, reservationLabel } from "./activity";
import { touchChanged } from "./changes";
import { getDeptId } from "./dept";
import { parseDateToken, parseTimeToken, kstDate, fmtT, type TgReply } from "./telegramCommands";

// /빈장비 [날짜] [시간] — 그 시간에 빌릴 수 있는 장비(분류별)와 세트, 세트는 [예약] 버튼으로 바로 예약
// 콜백: bks:<setId>:<시작 분>:<끝 분> (epoch 분 — 64바이트 제한 안)

export async function listFree(user: SessionUser, args: string): Promise<TgReply> {
  const now = new Date();
  let date = null as ReturnType<typeof parseDateToken>;
  let time = null as ReturnType<typeof parseTimeToken>;
  for (const t of args.split(/\s+/).filter(Boolean)) {
    if (!date && (date = parseDateToken(t, now))) continue;
    if (!time && (time = parseTimeToken(t))) continue;
  }
  if (!date) date = parseDateToken("오늘", now)!;
  if (time && time.eh * 60 + time.em <= time.sh * 60 + time.sm) return "❌ 종료 시각이 시작보다 빨라요.";
  const startAt = time ? kstDate(date.start, time.sh, time.sm) : kstDate(date.start, 0, 0);
  const endAt = time ? kstDate(date.start, time.eh, time.em) : kstDate(date.end, 24, 0);

  const all: any[] = await Resource.find({ isActive: true }).populate("categoryId", "name order").select("name status categoryId").lean();
  const busy: any[] = await Reservation.find({ status: "booked", startAt: { $lt: endAt }, endAt: { $gt: startAt } }).select("resourceId").lean();
  const busySet = new Set(busy.map((r) => String(r.resourceId)));
  const free = all.filter((r) => (r.status ?? "available") === "available" && !busySet.has(String(r._id)));
  const freeIds = new Set(free.map((r) => String(r._id)));

  const when = `${date.start.m}/${date.start.d}${date.end.d !== date.start.d || date.end.m !== date.start.m ? `~${date.end.m}/${date.end.d}` : ""} ${time ? `${fmtT(startAt)}~${fmtT(endAt)}` : "종일"}`;

  // 분류별 묶음
  const groups = new Map<string, { order: number; names: string[] }>();
  for (const r of free) {
    const g = r.categoryId?.name ?? "기타";
    if (!groups.has(g)) groups.set(g, { order: r.categoryId?.order ?? 999, names: [] });
    groups.get(g)!.names.push(r.name);
  }
  const groupLines = Array.from(groups.entries()).sort((a, b) => a[1].order - b[1].order)
    .map(([g, v]) => `<b>${esc(g)}</b> ${v.names.length} — ${esc(v.names.sort((a, b) => a.localeCompare(b, "ko")).join(", "))}`);

  // 세트 — 전부 비어 있으면 [예약] 버튼, 일부만이면 표시만
  const sets: any[] = await ResourceSet.find().select("name resourceIds").sort({ order: 1, name: 1 }).lean();
  const setLines: string[] = [];
  const buttons: TgButton[][] = [];
  const sMin = Math.floor(startAt.getTime() / 60_000), eMin = Math.floor(endAt.getTime() / 60_000);
  for (const s of sets) {
    const ids = (s.resourceIds ?? []).map(String);
    const ok = ids.filter((id: string) => freeIds.has(id)).length;
    if (ids.length === 0) continue;
    if (ok === ids.length) {
      setLines.push(`📦 ${esc(s.name)} — 전부 가능 (${ok}개)`);
      if (buttons.length < 6) buttons.push([{ text: `📦 ${s.name} 예약`, data: `bks:${String(s._id)}:${sMin}:${eMin}` }]);
    } else {
      setLines.push(`📦 ${esc(s.name)} — ${ok}/${ids.length}개만 가능`);
    }
  }

  if (free.length === 0) return `📦 ${when} — 빌릴 수 있는 장비가 없어요.`;
  return {
    text: [
      `📦 <b>빈 장비</b> ${when} · ${free.length}개`,
      groupLines.join("\n"),
      setLines.length ? `\n<b>세트</b>\n${setLines.join("\n")}` : "",
      buttons.length ? "\n세트는 아래 버튼으로 바로 예약돼요. 낱개는 /예약 장비명 날짜 시간" : "\n예약: /예약 장비명 날짜 시간",
    ].filter(Boolean).join("\n"),
    html: true,
    buttons: buttons.length ? buttons : undefined,
  };
}

/** bks:<setId>:<sMin>:<eMin> — 누른 시점에 다시 충돌 검사 후 예약 */
export async function handleBookSetCallback(p: { user: SessionUser; chatId: string; messageId: number; callbackId: string; data: string; messageText: string }) {
  const [, setId, sMin, eMin] = p.data.split(":");
  const startAt = new Date(Number(sMin) * 60_000), endAt = new Date(Number(eMin) * 60_000);
  const set: any = await ResourceSet.findById(setId).select("name resourceIds").lean();
  if (!set || isNaN(startAt.getTime()) || !(endAt > startAt)) { await answerCallback(p.callbackId, "세트를 찾을 수 없어요."); return; }
  const teamId = await getDeptId();
  if (!teamId || !canReserve(p.user, teamId)) { await answerCallback(p.callbackId, "예약 권한이 없어요."); return; }
  if (endAt.getTime() < Date.now()) { await answerCallback(p.callbackId, "이미 지난 시간이에요."); return; }

  const ids: string[] = (set.resourceIds ?? []).map(String);
  const unavailable = await findUnavailableResources(ids);
  const conflicts = await findConflicts(ids, { startAt, endAt });
  if (unavailable.length || conflicts.length) {
    await answerCallback(p.callbackId, "그새 다른 예약이 잡혔어요. /빈장비 로 다시 확인해주세요.");
    return;
  }
  await answerCallback(p.callbackId, "예약 중…");
  const names = new Map(((await Resource.find({ _id: { $in: ids } }).select("name").lean()) as any[]).map((r) => [String(r._id), r.name as string]));
  const done: string[] = [], lost: string[] = [];
  for (const rid of ids) {
    const r = await Reservation.create({ resourceId: rid, teamId, reservedBy: p.user.id, startAt, endAt, note: `텔레그램 세트 예약 (${set.name})` });
    if (await postCreateGuard(r)) { lost.push(names.get(rid) ?? "장비"); continue; }
    done.push(names.get(rid) ?? "장비");
  }
  if (done.length) {
    await logActivity({
      actorId: p.user.id, actorName: p.user.name ?? "", action: "create", targetType: "reservation",
      targetTitle: reservationLabel(`${set.name} 세트 (${done.length}개)`, startAt, endAt),
    });
    await touchChanged("resource");
  }
  const result = done.length
    ? `✅ ${set.name} 예약 완료 (${done.length}개) — ${p.user.name ?? ""}\n${fmtT(startAt)}~${fmtT(endAt)}${lost.length ? `\n⚠ 동시 접수로 실패: ${lost.join(", ")}` : ""}\n취소는 /내예약`
    : "❌ 같은 시간에 다른 예약이 먼저 접수됐어요.";
  await editTelegramMessage(p.chatId, p.messageId, `${p.messageText}\n\n${result}`);
}
