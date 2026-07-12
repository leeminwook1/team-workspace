import { connectDB } from "./mongodb";
import { User } from "@/models/User";
import { Team } from "@/models/Team";
import { Category } from "@/models/Category";
import { Task } from "@/models/Task";
import { Resource } from "@/models/Resource";
import { Reservation } from "@/models/Reservation";
import { canCreateTaskInAll, canReserve, visibleTeamIds, type SessionUser, type Role } from "./permissions";
import { taskWindow, findConflicts, conflictMessage, syncTaskReservations } from "./taskReservations";
import { logActivity, reservationLabel } from "./activity";

// 텔레그램 인바운드 명령 v1 — /일정 /예약 /오늘 /내일 /예약현황 /연동 /도움말
// 시간은 숫자 형식만 지원: 14:00-16:00 또는 14-16

const KST = 9 * 3600_000;

const HELP = `📖 사용법

/일정 제목 날짜 [시간] [옵션] [장비:이름,이름2]
  · 날짜: 7/20, 2026-07-20, 오늘, 내일, 7/20-7/22(기간)
  · 시간: 14:00-16:00 또는 14-16 (없으면 종일)
  · 옵션: @팀이름 #카테고리 !긴급 !높음 장소:내용
  · 장비: 는 맨 뒤에 — 일정과 연동된 예약이 함께 잡혀요
  예) /일정 노방활동 7/20 14:00-16:00 #촬영 장비:캐논 R6(7-1), 배터리(7-1)

/예약 장비명[, 장비명2] 날짜 [시간]
  예) /예약 캐논 R6, 배터리(7-1) 내일 14-16

/오늘 · /내일 — 일정 조회
/예약현황 [날짜] — 장비 예약 현황
/연동 123456 — 계정 연결 (코드는 TeamCal 설정에서 발급)`;

// ── 파싱 유틸 ──
type DateRange = { start: { y: number; m: number; d: number }; end: { y: number; m: number; d: number } };

function parseOneDate(s: string, now: Date): { y: number; m: number; d: number } | null {
  const kst = new Date(now.getTime() + KST);
  if (s === "오늘") return { y: kst.getUTCFullYear(), m: kst.getUTCMonth() + 1, d: kst.getUTCDate() };
  if (s === "내일") {
    const t = new Date(kst.getTime() + 86_400_000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return { y: kst.getUTCFullYear(), m: +m[1], d: +m[2] };
  return null;
}

function parseDateToken(s: string, now: Date): DateRange | null {
  // 기간: 7/20-7/22 또는 2026-07-20-2026-07-22 (앞뒤 각각 파싱)
  const rangeMatch = s.match(/^(.+?)-(\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2}|오늘|내일)$/);
  if (rangeMatch && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const a = parseOneDate(rangeMatch[1], now);
    const b = parseOneDate(rangeMatch[2], now);
    if (a && b) return { start: a, end: b };
  }
  const one = parseOneDate(s, now);
  return one ? { start: one, end: one } : null;
}

function parseTimeToken(s: string): { sh: number; sm: number; eh: number; em: number } | null {
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const sh = +m[1], sm = +(m[2] ?? 0), eh = +m[3], em = +(m[4] ?? 0);
  if (sh > 23 || eh > 24 || sm > 59 || em > 59) return null;
  return { sh, sm, eh, em };
}

const ymd = (d: { y: number; m: number; d: number }) =>
  `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
// KST 시각 → UTC Date
const kstDate = (d: { y: number; m: number; d: number }, h: number, min: number) =>
  new Date(Date.UTC(d.y, d.m - 1, d.d, h, min) - KST);

const fmtT = (dt: Date) =>
  new Date(dt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });

// 장비 이름 매칭 (부분 일치, 대소문자 무시) — /일정 장비: 와 /예약 이 공유
async function matchResources(names: string[]): Promise<{ picked: { id: string; name: string }[] } | { error: string }> {
  const all: any[] = await Resource.find({ isActive: true }).select("name").lean();
  const picked: { id: string; name: string }[] = [];
  for (const q of names) {
    const hits = all.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
    if (hits.length === 0) return { error: `❌ "${q}" 와 일치하는 장비가 없어요.` };
    if (hits.length > 1) {
      const exact = hits.find((r) => r.name.toLowerCase() === q.toLowerCase());
      if (!exact) {
        return { error: `"${q}" 가 여러 개와 일치해요 — 더 구체적으로 써주세요:\n${hits.slice(0, 8).map((r) => `· ${r.name}`).join("\n")}` };
      }
      picked.push({ id: String(exact._id), name: exact.name });
      continue;
    }
    picked.push({ id: String(hits[0]._id), name: hits[0].name });
  }
  return { picked };
}

function toSessionUser(u: any): SessionUser {
  return { id: String(u._id), name: u.name, role: (u.role ?? "member") as Role, teamId: u.teamId ? String(u.teamId) : null, status: u.status };
}

// ── 메인 진입점: 명령 처리 → 답장 텍스트 반환 ──
export async function handleTelegramCommand(chatId: string, text: string): Promise<string> {
  await connectDB();
  const trimmed = text.trim();
  const [cmd, ...rest] = trimmed.split(/\s+/);
  const args = rest.join(" ");

  // /연동 — 계정 연결 전에도 동작
  if (cmd === "/연동" || cmd.startsWith("/link")) {
    return linkAccount(chatId, rest[0] ?? "");
  }
  if (cmd === "/start") {
    return "👋 TeamCal 알림봇입니다.\n\nTeamCal 설정(내 계정) → 텔레그램 알림에서 [연동 코드 발급] 후\n/연동 123456 형식으로 보내면 계정이 연결돼요.\n\n명령어 안내는 /도움말";
  }
  if (cmd === "/도움말" || cmd === "/help") return HELP;

  // 이하 명령은 연동된 계정 필요
  const userDoc: any = await User.findOne({ telegramChatId: chatId, status: "active" }).lean();
  if (!userDoc) {
    return "❌ 아직 계정이 연결되지 않았어요.\nTeamCal 설정 → 텔레그램 알림에서 [연동 코드 발급] 후 /연동 123456 을 보내주세요.";
  }
  const user = toSessionUser(userDoc);

  try {
    switch (cmd) {
      case "/일정": return await createTask(user, args);
      case "/예약": return await createReservation(user, args);
      case "/오늘": case "/today": return await listDay(user, 0);
      case "/내일": case "/tomorrow": return await listDay(user, 1);
      case "/예약현황": case "/reservations": return await listReservations(rest[0] ?? "오늘");
      default:
        return `모르는 명령이에요: ${cmd}\n\n${HELP}`;
    }
  } catch (e) {
    console.error("[telegram] 명령 처리 오류:", e);
    return "❌ 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.";
  }
}

// ── /연동 ──
async function linkAccount(chatId: string, code: string): Promise<string> {
  if (!/^\d{6}$/.test(code)) return "사용법: /연동 123456\n코드는 TeamCal 설정 → 텔레그램 알림에서 발급해요.";
  const u: any = await User.findOne({ tgLinkCode: code, tgLinkCodeExp: { $gt: new Date() } });
  if (!u) return "❌ 코드가 틀렸거나 만료됐어요 (10분 유효). 설정에서 다시 발급해주세요.";
  u.telegramChatId = chatId;
  u.tgLinkCode = "";
  u.tgLinkCodeExp = null;
  await u.save();
  return `✅ 연동 완료! ${u.name} 님, 이제 알림을 여기로 받고 /일정 /예약 명령을 쓸 수 있어요.\n\n${HELP}`;
}

// ── /일정 ──
async function createTask(user: SessionUser, args: string): Promise<string> {
  if (!args) return "사용법: /일정 제목 날짜 [시간] [옵션] [장비:이름,이름2]\n예) /일정 주간회의 내일 14:00-15:00";
  const now = new Date();

  // 장비: 는 이름에 공백·쉼표가 들어가므로 맨 뒤에서 통째로 추출 (마지막 옵션으로 쓸 것)
  let equipNames: string[] = [];
  const em = args.match(/(?:^|\s)장비:(.+)$/);
  if (em) {
    equipNames = em[1].split(",").map((s) => s.trim()).filter(Boolean);
    args = args.slice(0, em.index).trim();
  }

  const tokens = args.split(/\s+/);

  let date: DateRange | null = null;
  let time: ReturnType<typeof parseTimeToken> = null;
  let teamName = "", catName = "", priority = "normal", location = "";
  const titleParts: string[] = [];

  for (const t of tokens) {
    if (!date && (date = parseDateToken(t, now))) continue;
    if (date && !time && (time = parseTimeToken(t))) continue;
    if (t.startsWith("@")) { teamName = t.slice(1); continue; }
    if (t.startsWith("#")) { catName = t.slice(1); continue; }
    if (t === "!긴급") { priority = "urgent"; continue; }
    if (t === "!높음") { priority = "high"; continue; }
    if (t.startsWith("장소:")) { location = t.slice(3); continue; }
    titleParts.push(t);
  }
  const title = titleParts.join(" ").trim();
  if (!title) return "❌ 제목이 없어요.\n예) /일정 주간회의 내일 14:00-15:00";
  if (!date) return "❌ 날짜를 못 찾았어요. 7/20, 2026-07-20, 오늘, 내일 형식으로 써주세요.";
  if (time && time.eh * 60 + time.em <= time.sh * 60 + time.sm) return "❌ 종료 시각이 시작보다 빨라요.";

  // 팀 결정 — @팀이름 또는 내 소속팀
  let teamId = user.teamId;
  let teamLabel = "";
  if (teamName) {
    const team: any = await Team.findOne({ name: teamName, isActive: true }).lean();
    if (!team) return `❌ "${teamName}" 팀을 찾을 수 없어요.`;
    teamId = String(team._id);
    teamLabel = team.name;
  } else if (teamId) {
    const team: any = await Team.findById(teamId).select("name").lean();
    teamLabel = team?.name ?? "";
  }
  if (!teamId) return "❌ 소속 팀이 없어요. @팀이름 으로 팀을 지정해주세요. 예) @사진";
  if (!canCreateTaskInAll(user, [teamId])) return `❌ ${teamLabel || "그 팀"}에 일정을 등록할 권한이 없어요.`;

  // 카테고리
  let categoryId: string | null = null;
  if (catName) {
    const cat: any = await Category.findOne({ name: catName, isActive: true }).lean();
    if (!cat) return `❌ "#${catName}" 카테고리를 찾을 수 없어요.`;
    categoryId = String(cat._id);
  }

  const allDay = !time;
  const startDate = allDay ? new Date(ymd(date.start)) : kstDate(date.start, time!.sh, time!.sm);
  const endDate = allDay ? new Date(ymd(date.end)) : kstDate(date.start, time!.eh, time!.em);

  // 장비 연동 — 웹과 동일하게 일정 생성 전에 충돌 검사, 생성 후 연동 예약
  let equipment: { id: string; name: string }[] = [];
  const window = taskWindow({ startDate, endDate, allDay });
  if (equipNames.length > 0) {
    const m = await matchResources(equipNames);
    if ("error" in m) return m.error;
    equipment = m.picked;
    const conflicts = await findConflicts(equipment.map((p) => p.id), window);
    if (conflicts.length > 0) return `❌ ${conflictMessage(conflicts)}`;
  }

  const task = await Task.create({
    title, teamIds: [teamId], categoryId, assignees: [], createdBy: user.id,
    startDate, endDate, allDay, priority, location,
  });
  if (equipment.length > 0) {
    await syncTaskReservations(task, equipment.map((p) => p.id), window, user.id);
  }
  await logActivity({ actorId: user.id, actorName: user.name ?? "", action: "create", targetTitle: `${task.title} (텔레그램)` });

  const when = date.start.m === date.end.m && date.start.d === date.end.d
    ? `${date.start.m}/${date.start.d}`
    : `${date.start.m}/${date.start.d}~${date.end.m}/${date.end.d}`;
  const timeStr = allDay ? "종일" : `${String(time!.sh).padStart(2, "0")}:${String(time!.sm).padStart(2, "0")}-${String(time!.eh).padStart(2, "0")}:${String(time!.em).padStart(2, "0")}`;
  const extras = [catName && `#${catName}`, priority === "urgent" && "🔴긴급", priority === "high" && "🟠높음", location && `📍${location}`].filter(Boolean).join(" ");
  const equipLine = equipment.length > 0 ? `\n📦 장비 예약: ${equipment.map((p) => p.name).join(", ")}` : "";
  return `✅ 일정 등록: ${title}\n${when} ${timeStr} · ${teamLabel}${extras ? `\n${extras}` : ""}${equipLine}`;
}

// ── /예약 ──
async function createReservation(user: SessionUser, args: string): Promise<string> {
  if (!args) return "사용법: /예약 장비명[, 장비명2] 날짜 [시간] [@팀]\n예) /예약 캐논 R6 내일 14-16";
  const now = new Date();
  let tokens = args.split(/\s+/);

  // @팀이름 — 전사 역할(소속 팀 없음)용 팀 지정
  let teamOverride = "";
  tokens = tokens.filter((t) => {
    if (t.startsWith("@")) { teamOverride = t.slice(1); return false; }
    return true;
  });

  // 첫 날짜 토큰을 경계로: 앞 = 장비명들, 뒤 = 시간
  let date: DateRange | null = null;
  let dateIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    const d = parseDateToken(tokens[i], now);
    if (d) { date = d; dateIdx = i; break; }
  }
  if (!date || dateIdx === 0) return "❌ 날짜를 못 찾았어요.\n예) /예약 캐논 R6 내일 14-16";
  const time = dateIdx + 1 < tokens.length ? parseTimeToken(tokens[dateIdx + 1]) : null;

  const names = tokens.slice(0, dateIdx).join(" ").split(",").map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return "❌ 장비 이름이 없어요.";

  let teamId = user.teamId;
  if (teamOverride) {
    const team: any = await Team.findOne({ name: teamOverride, isActive: true }).lean();
    if (!team) return `❌ "${teamOverride}" 팀을 찾을 수 없어요.`;
    teamId = String(team._id);
  }
  if (!teamId) return "❌ 소속 팀이 없어요. @팀이름 으로 팀을 지정해주세요. 예) /예약 캐논 R6 내일 14-16 @사진";
  if (!canReserve(user, teamId)) return "❌ 예약 권한이 없어요.";

  const m = await matchResources(names);
  if ("error" in m) return m.error;
  const picked = m.picked;

  // 시간창 — 시간 없으면 그 날짜 전체(KST)
  const startAt = time ? kstDate(date.start, time.sh, time.sm) : kstDate(date.start, 0, 0);
  const endAt = time ? kstDate(date.start, time.eh, time.em) : kstDate(date.end, 24, 0);
  if (endAt <= startAt) return "❌ 종료 시각이 시작보다 빨라요.";

  const conflicts = await findConflicts(picked.map((p) => p.id), { startAt, endAt });
  if (conflicts.length > 0) return `❌ ${conflictMessage(conflicts)}`;

  for (const p of picked) {
    await Reservation.create({
      resourceId: p.id, teamId, reservedBy: user.id,
      startAt, endAt, note: "텔레그램 예약",
    });
    await logActivity({
      actorId: user.id, actorName: user.name ?? "", action: "create", targetType: "reservation",
      targetTitle: reservationLabel(p.name, startAt, endAt),
    });
  }
  const when = `${date.start.m}/${date.start.d} ${fmtT(startAt)}~${fmtT(endAt)}`;
  return `✅ 예약 완료 (${picked.length}건)\n${picked.map((p) => `· ${p.name}`).join("\n")}\n${when}`;
}

// ── /오늘 /내일 ──
async function listDay(user: SessionUser, offset: number): Promise<string> {
  const kst = new Date(Date.now() + KST);
  const day = { y: kst.getUTCFullYear(), m: kst.getUTCMonth() + 1, d: kst.getUTCDate() + offset };
  const start = kstDate(day, 0, 0);
  const end = kstDate(day, 24, 0);

  const q: any = { startDate: { $lt: end }, endDate: { $gt: start } };
  const scope = visibleTeamIds(user);
  if (scope !== "all") {
    if (scope.length === 0) return "소속 팀이 없어 조회할 일정이 없어요.";
    q.teamIds = { $in: scope };
  }
  const tasks: any[] = await Task.find(q).populate("teamIds", "name").sort({ allDay: -1, startDate: 1 }).limit(15).lean();
  const label = offset === 0 ? "오늘" : "내일";
  if (tasks.length === 0) return `${label}은 등록된 일정이 없어요. 🎉`;

  const lines = tasks.map((t) => {
    const time = t.allDay ? "종일" : `${fmtT(t.startDate)}`;
    const team = (t.teamIds ?? []).map((tm: any) => tm.name).join("·");
    const done = t.status === "done" ? " ✔" : "";
    return `· ${time} ${t.title}${team ? ` (${team})` : ""}${done}`;
  });
  return `📅 ${label} 일정 ${tasks.length}건\n${lines.join("\n")}`;
}

// ── /예약현황 ──
async function listReservations(dateArg: string): Promise<string> {
  const d = parseOneDate(dateArg, new Date());
  if (!d) return "사용법: /예약현황 7/20 (생략하면 오늘)";
  const start = kstDate(d, 0, 0);
  const end = kstDate(d, 24, 0);
  const list: any[] = await Reservation.find({ status: "booked", startAt: { $lt: end }, endAt: { $gt: start } })
    .populate("resourceId", "name").populate("teamId", "name").populate("reservedBy", "name")
    .sort({ startAt: 1 }).limit(20).lean();
  if (list.length === 0) return `${d.m}/${d.d} 예약이 없어요.`;
  const lines = list.map((r) =>
    `· ${r.resourceId?.name ?? "?"} ${fmtT(r.startAt)}~${fmtT(r.endAt)} (${r.teamId?.name ?? "?"} ${r.reservedBy?.name ?? ""})`
  );
  return `📦 ${d.m}/${d.d} 장비 예약 ${list.length}건\n${lines.join("\n")}`;
}
