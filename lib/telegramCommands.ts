import { connectDB } from "./mongodb";
import { User } from "@/models/User";
import { Team } from "@/models/Team";
import { Category } from "@/models/Category";
import { Task } from "@/models/Task";
import { Resource } from "@/models/Resource";
import { Reservation } from "@/models/Reservation";
import { PersonalEvent } from "@/models/PersonalEvent";
import {
  canCreateTaskInAll, canReserve, visibleTeamIds, canChangeStatusAny, canDeleteTaskDoc, canMarkReturned,
  type SessionUser, type Role,
} from "./permissions";
import { taskWindow, findConflicts, conflictMessage, syncTaskReservations, postCreateGuard, cancelTaskReservations, findUnavailableResources, unavailableMessage } from "./taskReservations";
import { logActivity, reservationLabel } from "./activity";
import { rateLimit } from "./rateLimit";
import { notify } from "./notify";
import { touchChanged } from "./changes";
import { esc, answerCallback, editTelegramMessage, type TgButton } from "./telegram";

// 명령 응답 — 문자열(플레인) 또는 서식·버튼 포함 객체
export type TgReply = string | { text: string; html?: boolean; buttons?: TgButton[][] };

// 텔레그램 인바운드 명령 v1 — /일정 /예약 /오늘 /내일 /예약현황 /연동 /도움말
// 시간은 숫자 형식만 지원: 14:00-16:00 또는 14-16

const KST = 9 * 3600_000;

const HELP = `📖 사용법

/일정 제목 날짜 [시간] [옵션] [담당:이름] [장비:이름]
  · 날짜: 7/20, 오늘, 내일, 모레, 금요일, 다음주 화요일, 7/20-7/22(기간)
  · 시간: 14-16, 14:00-16:00, 14시-16시 (없으면 종일)
  · 옵션: @팀이름 #카테고리 !긴급 !높음 장소:내용
  · 담당: 장비: 는 맨 뒤에 — 쉼표로 여러 명·여러 개
  예) /일정 노방활동 금요일 14-16 #촬영 담당:이민욱 장비:캐논 R6(7-1)

/개인 제목 날짜 [시간] [장소:내용] — 내 캘린더에만 표시
  예) /개인 병원 예약 내일 15-16

/예약 장비명[, 장비명2] 날짜 [시간]
  예) /예약 캐논 R6, 배터리(7-1) 내일 14-16

/오늘 · /내일 · /이번주 — 일정 조회
/내일정 — 내가 담당인 업무 (번호 표시)
/완료 3 — /내일정의 3번 업무 완료 처리 (제목 일부로도 가능)
/검색 키워드 — 일정 제목 검색
/예약현황 [날짜] — 장비 예약 현황
/내예약 — 내 장비 예약 (반납·취소 버튼)
/연동 123456 — 계정 연결 (코드는 CHQ 설정에서 발급)
/챗아이디 — 이 대화방 챗 ID (팀 그룹방 브리핑 등록용)`;

// ── 파싱 유틸 ──
type DateRange = { start: { y: number; m: number; d: number }; end: { y: number; m: number; d: number } };

const WEEKDAY_IDX: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

function parseOneDate(s: string, now: Date): { y: number; m: number; d: number } | null {
  const kst = new Date(now.getTime() + KST);
  const fromKst = (t: Date) => ({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
  const plusDays = (n: number) => fromKst(new Date(kst.getTime() + n * 86_400_000));

  if (s === "오늘") return plusDays(0);
  if (s === "내일") return plusDays(1);
  if (s === "모레") return plusDays(2);

  // 요일 — 다가오는 그 요일 (오늘이 그 요일이면 오늘), "다음주 X요일"은 다음 주(월요일 시작)의 그 요일
  let m = s.match(/^(다음주)?([월화수목금토일])요일$/);
  if (m) {
    const target = WEEKDAY_IDX[m[2]];
    const dow = kst.getUTCDay();
    if (m[1]) {
      const daysToNextMon = (8 - dow) % 7 || 7; // 다음 주 월요일까지
      return plusDays(daysToNextMon + ((target + 6) % 7)); // 월=0 … 일=6
    }
    return plusDays((target - dow + 7) % 7);
  }

  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return { y: kst.getUTCFullYear(), m: +m[1], d: +m[2] };
  return null;
}

function parseDateToken(s: string, now: Date): DateRange | null {
  // 기간: 7/20-7/22, 금요일-일요일 등 (앞뒤 각각 파싱)
  const rangeMatch = s.match(/^(.+?)-(\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2}|오늘|내일|모레|(?:다음주)?[월화수목금토일]요일)$/);
  if (rangeMatch && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const a = parseOneDate(rangeMatch[1], now);
    const b = parseOneDate(rangeMatch[2], now);
    if (a && b) return { start: a, end: b };
  }
  const one = parseOneDate(s, now);
  return one ? { start: one, end: one } : null;
}

function parseTimeToken(s: string): { sh: number; sm: number; eh: number; em: number } | null {
  // 14-16, 14:00-16:00, 14시-16시, 14~16 모두 허용
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?시?[-~](\d{1,2})(?::(\d{2}))?시?$/);
  if (!m) return null;
  const sh = +m[1], sm = +(m[2] ?? 0), eh = +m[3], em = +(m[4] ?? 0);
  if (sh > 23 || eh > 24 || sm > 59 || em > 59) return null;
  return { sh, sm, eh, em };
}

// 꼬리 옵션(담당: 장비:) 추출 — 값에 공백·쉼표가 들어가므로 맨 뒤에 몰아 쓰고,
// 첫 키 등장 위치부터 끝까지를 키별 구간으로 나눈다 (담당·장비 순서는 무관)
function extractTailSections(args: string, keys: string[]): { rest: string; sections: Record<string, string> } {
  const re = new RegExp(`(?:^|\\s)(${keys.join("|")}):`, "g");
  const hits: { key: string; idx: number; valStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(args))) hits.push({ key: m[1], idx: m.index, valStart: m.index + m[0].length });
  if (hits.length === 0) return { rest: args, sections: {} };
  const sections: Record<string, string> = {};
  for (let i = 0; i < hits.length; i++) {
    const end = i + 1 < hits.length ? hits[i + 1].idx : args.length;
    sections[hits[i].key] = args.slice(hits[i].valStart, end).trim();
  }
  return { rest: args.slice(0, hits[0].idx).trim(), sections };
}
const splitNames = (s: string | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

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

// 담당자 이름 매칭 (부분 일치, 대소문자 무시) — /일정 담당: 용
async function matchUsers(names: string[]): Promise<{ picked: { id: string; name: string }[] } | { error: string }> {
  const all: any[] = await User.find({ status: "active" }).select("name").lean();
  const picked: { id: string; name: string }[] = [];
  for (const q of names) {
    const hits = all.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()));
    if (hits.length === 0) return { error: `❌ "${q}" 이름의 사용자를 찾을 수 없어요.` };
    if (hits.length > 1) {
      const exact = hits.filter((u) => u.name.toLowerCase() === q.toLowerCase());
      if (exact.length !== 1) {
        return { error: `"${q}" 가 여러 명과 일치해요 — 이름을 정확히 써주세요:\n${hits.slice(0, 8).map((u) => `· ${u.name}`).join("\n")}` };
      }
      picked.push({ id: String(exact[0]._id), name: exact[0].name });
      continue;
    }
    picked.push({ id: String(hits[0]._id), name: hits[0].name });
  }
  // 같은 사람 중복 지정 제거
  const seen = new Set<string>();
  return { picked: picked.filter((p) => !seen.has(p.id) && seen.add(p.id)) };
}

function toSessionUser(u: any): SessionUser {
  return { id: String(u._id), name: u.name, role: (u.role ?? "member") as Role, teamId: u.teamId ? String(u.teamId) : null, status: u.status };
}

// ── 메인 진입점: 명령 처리 → 답장 반환 ──
// fromId: 보낸 사람의 개인 ID (그룹방에서도 개인 계정으로 식별). 생략 시 chatId 사용.
export async function handleTelegramCommand(chatId: string, text: string, fromId?: string): Promise<TgReply> {
  await connectDB();
  // "다음주 월요일"처럼 띄어 쓴 상대 날짜를 한 토큰으로 정규화
  const trimmed = text.trim()
    .replace(/다음\s?주\s+([월화수목금토일])요일/g, "다음주$1요일")
    .replace(/이번\s?주\s+([월화수목금토일])요일/g, "$1요일");
  const [cmdRaw, ...rest] = trimmed.split(/\s+/);
  const cmd = cmdRaw.split("@")[0]; // 그룹방에서는 /명령@봇이름 형태로 옴
  const args = rest.join(" ");

  // 연동 없이 동작하는 명령
  if (cmd === "/연동" || cmd === "/link") {
    // 그룹방에서 연동하면 그룹 ID가 계정에 붙어 알림이 그룹으로 새므로 차단
    if (fromId && fromId !== chatId) return "🔒 계정 연동은 봇과의 1:1 대화방에서 보내주세요.";
    return linkAccount(chatId, rest[0] ?? "");
  }
  if (cmd === "/start") {
    return "👋 CHQ 알림봇입니다.\n\nCHQ 설정(내 계정) → 텔레그램 알림에서 [연동 코드 발급] 후\n/연동 123456 형식으로 보내면 계정이 연결돼요.\n\n명령어 안내는 /도움말";
  }
  if (cmd === "/도움말" || cmd === "/help") return HELP;
  if (cmd === "/챗아이디" || cmd === "/chatid") {
    return `이 대화방의 챗 ID: ${chatId}\n\n팀 그룹방이라면 관리자가 [관리자 → 팀 관리]에서 이 ID를 등록하면 매일 아침 팀 브리핑이 와요.`;
  }

  // 이하 명령은 연동된 계정 필요 — 그룹방에서는 보낸 사람(fromId) 기준.
  // 과거에 같은 챗이 여러 계정에 연동됐다면 가장 최근 계정 우선.
  const personalId = fromId ?? chatId;
  const userDoc: any = await User.findOne({ telegramChatId: personalId, status: "active" }).sort({ updatedAt: -1 }).lean();
  if (!userDoc) {
    return "❌ 아직 계정이 연결되지 않았어요.\nCHQ 설정 → 텔레그램 알림에서 [연동 코드 발급] 후 봇과의 1:1 대화방에서 /연동 123456 을 보내주세요.";
  }
  const user = toSessionUser(userDoc);

  try {
    switch (cmd) {
      case "/일정": case "/schedule": return await createTask(user, args);
      case "/개인": case "/private": return await createPersonalEvent(user, args);
      case "/예약": case "/book": return await createReservation(user, args);
      case "/오늘": case "/today": return await listDay(user, 0);
      case "/내일": case "/tomorrow": return await listDay(user, 1);
      case "/이번주": case "/week": return await listWeek(user);
      case "/내일정": case "/mytasks": return await listMyTasks(user);
      case "/완료": case "/complete": return await completeMyTask(user, args);
      case "/검색": case "/find": return await searchTasks(user, args);
      case "/예약현황": case "/reservations": return await listReservations(rest[0] ?? "오늘");
      case "/내예약": case "/mybookings": return await listMyReservations(user);
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
  if (!/^\d{6}$/.test(code)) return "사용법: /연동 123456\n코드는 CHQ 설정 → 텔레그램 알림에서 발급해요.";
  // 무차별 대입 방어 — 같은 챗에서 10분 내 5회 초과 시 차단
  const rl = await rateLimit(`tglink:${chatId}`, 5, 10 * 60 * 1000);
  if (!rl.ok) return `❌ 시도 횟수를 초과했어요. ${Math.ceil(rl.retryAfterSec / 60)}분 후 다시 시도해주세요.`;
  const u: any = await User.findOne({ tgLinkCode: code, tgLinkCodeExp: { $gt: new Date() } });
  if (!u) return "❌ 코드가 틀렸거나 만료됐어요 (10분 유효). 설정에서 다시 발급해주세요.";
  // 한 텔레그램 = 한 계정 — 같은 챗이 다른 계정에 남아 있으면 해제 (등록자 오인 방지)
  await User.updateMany({ _id: { $ne: u._id }, telegramChatId: chatId }, { $set: { telegramChatId: "" } });
  u.telegramChatId = chatId;
  u.tgLinkCode = "";
  u.tgLinkCodeExp = null;
  await u.save();
  return `✅ 연동 완료! ${u.name} 님, 이제 알림을 여기로 받고 /일정 /예약 명령을 쓸 수 있어요.\n\n${HELP}`;
}

// ── /일정 ──
async function createTask(user: SessionUser, args: string): Promise<TgReply> {
  if (!args) {
    return `📝 이렇게 보내면 바로 등록돼요 (복사해서 수정):

/일정 주간회의 내일 14-16
/일정 노방활동 7/20 14시-16시 #촬영
/일정 워크숍 7/20-7/22

뒤에 붙이는 옵션 (모두 선택)
· @팀이름 — 다른 팀 일정 (예: @사진)
· #카테고리 · !긴급 · !높음 · 장소:2층
· 담당:이름,이름2 — 담당자 지정 (알림도 감)
· 장비:캐논 R6, 배터리 — 장비 예약도 함께`;
  }
  const now = new Date();

  // 담당:·장비: 는 값에 공백·쉼표가 들어가므로 맨 뒤에서 통째로 추출
  const tail = extractTailSections(args, ["장비", "담당"]);
  args = tail.rest;
  const equipNames = splitNames(tail.sections["장비"]);
  const assigneeNames = splitNames(tail.sections["담당"]);

  const tokens = args.split(/\s+/);

  let date: DateRange | null = null;
  let time: ReturnType<typeof parseTimeToken> = null;
  let teamName = "", catName = "", priority = "normal", location = "";
  const titleParts: string[] = [];

  for (const t of tokens) {
    if (!date && (date = parseDateToken(t, now))) continue;
    if (!time && (time = parseTimeToken(t))) continue; // 시간은 날짜 앞뒤 어디든 OK
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

  // 담당자 — 이름으로 매칭 (여러 명 쉼표 구분)
  let assignees: { id: string; name: string }[] = [];
  if (assigneeNames.length > 0) {
    const m = await matchUsers(assigneeNames);
    if ("error" in m) return m.error;
    assignees = m.picked;
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
    const unavailable = await findUnavailableResources(equipment.map((p) => p.id));
    if (unavailable.length > 0) return `❌ ${unavailableMessage(unavailable)}`;
    const conflicts = await findConflicts(equipment.map((p) => p.id), window);
    if (conflicts.length > 0) return `❌ ${conflictMessage(conflicts)}`;
  }

  const task = await Task.create({
    title, teamIds: [teamId], categoryId, assignees: assignees.map((a) => a.id), createdBy: user.id,
    startDate, endDate, allDay, priority, location,
  });
  if (equipment.length > 0) {
    await syncTaskReservations(task, equipment.map((p) => p.id), window, user.id);
  }
  await logActivity({ actorId: user.id, actorName: user.name ?? "", action: "create", targetTitle: `${task.title} (텔레그램)` });
  // 담당자 알림 — 웹 등록과 동일 (본인 제외)
  if (assignees.length > 0) {
    await notify(assignees.map((a) => a.id).filter((id) => id !== user.id), {
      type: "task_assigned",
      title: "새 업무에 담당자로 지정됐어요",
      body: title,
      link: `/calendar?task=${task._id}`,
    });
  }

  const when = date.start.m === date.end.m && date.start.d === date.end.d
    ? `${date.start.m}/${date.start.d}`
    : `${date.start.m}/${date.start.d}~${date.end.m}/${date.end.d}`;
  const timeStr = allDay ? "종일" : `${String(time!.sh).padStart(2, "0")}:${String(time!.sm).padStart(2, "0")}-${String(time!.eh).padStart(2, "0")}:${String(time!.em).padStart(2, "0")}`;
  const extras = [catName && `#${esc(catName)}`, priority === "urgent" && "🔴긴급", priority === "high" && "🟠높음", location && `📍${esc(location)}`].filter(Boolean).join(" ");
  const assigneeLine = assignees.length > 0 ? `\n👤 담당: ${esc(assignees.map((a) => a.name).join(", "))}` : "";
  const equipLine = equipment.length > 0 ? `\n📦 장비 예약: ${esc(equipment.map((p) => p.name).join(", "))}` : "";
  return {
    text: `✅ 일정 등록: <b>${esc(title)}</b> (${esc(user.name ?? "")})\n${when} ${timeStr} · ${esc(teamLabel)}${extras ? `\n${extras}` : ""}${assigneeLine}${equipLine}`,
    html: true,
    buttons: [[{ text: "↩ 방금 등록 취소", data: `undo:${task._id}` }]],
  };
}

// ── /개인 (개인 일정 — 내 캘린더) ──
async function createPersonalEvent(user: SessionUser, args: string): Promise<TgReply> {
  if (!args) {
    return `📝 개인 일정은 이렇게 (복사해서 수정):

/개인 병원 예약 내일 15-16
/개인 휴가 7/20-7/22
/개인 미팅 금요일 14시-15시 장소:강남

· 날짜: 7/20, 오늘, 내일, 모레, 금요일, 다음주 화요일, 7/20-7/22(기간)
· 시간: 14-16, 14:00-16:00 (없으면 종일)
· 장소:내용 (선택)
🔒 개인 일정은 내 캘린더에만 표시돼요 (같은 팀 팀장·관리자만 열람).`;
  }
  const now = new Date();
  const tokens = args.split(/\s+/);

  let date: DateRange | null = null;
  let time: ReturnType<typeof parseTimeToken> = null;
  let location = "";
  const titleParts: string[] = [];
  for (const t of tokens) {
    if (!date && (date = parseDateToken(t, now))) continue;
    if (!time && (time = parseTimeToken(t))) continue;
    if (t.startsWith("장소:")) { location = t.slice(3); continue; }
    titleParts.push(t);
  }
  const title = titleParts.join(" ").trim();
  if (!title) return "❌ 제목이 없어요.\n예) /개인 병원 예약 내일 15-16";
  if (!date) return "❌ 날짜를 못 찾았어요. 7/20, 2026-07-20, 오늘, 내일 형식으로 써주세요.";
  if (time && time.eh * 60 + time.em <= time.sh * 60 + time.sm) return "❌ 종료 시각이 시작보다 빨라요.";

  const allDay = !time;
  const startDate = allDay ? new Date(ymd(date.start)) : kstDate(date.start, time!.sh, time!.sm);
  const endDate = allDay ? new Date(ymd(date.end)) : kstDate(date.start, time!.eh, time!.em);

  const ev = await PersonalEvent.create({ userId: user.id, title, memo: "", location, startDate, endDate, allDay });
  await touchChanged("personal"); // 웹 '내 캘린더' 자동 반영

  const p2 = (n: number) => String(n).padStart(2, "0");
  const when = date.start.m === date.end.m && date.start.d === date.end.d
    ? `${date.start.m}/${date.start.d}`
    : `${date.start.m}/${date.start.d}~${date.end.m}/${date.end.d}`;
  const timeStr = allDay ? "종일" : `${p2(time!.sh)}:${p2(time!.sm)}-${p2(time!.eh)}:${p2(time!.em)}`;
  const locLine = location ? `\n📍 ${esc(location)}` : "";
  return {
    text: `✅ 개인 일정 등록: <b>${esc(title)}</b> (${esc(user.name ?? "")})\n${when} ${timeStr}${locLine}\n🔒 내 캘린더에만 표시돼요.`,
    html: true,
    buttons: [[{ text: "↩ 방금 등록 취소", data: `pundo:${ev._id}` }]],
  };
}

// ── /예약 ──
async function createReservation(user: SessionUser, args: string): Promise<TgReply> {
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

  const unavailable = await findUnavailableResources(picked.map((p) => p.id));
  if (unavailable.length > 0) return `❌ ${unavailableMessage(unavailable)}`;
  const conflicts = await findConflicts(picked.map((p) => p.id), { startAt, endAt });
  if (conflicts.length > 0) return `❌ ${conflictMessage(conflicts)}`;

  const done: { id: string; name: string; rid: string }[] = [];
  const lost: string[] = [];
  for (const p of picked) {
    const r = await Reservation.create({
      resourceId: p.id, teamId, reservedBy: user.id,
      startAt, endAt, note: "텔레그램 예약",
    });
    // 동시 요청 이중예약 방어
    if (await postCreateGuard(r)) { lost.push(p.name); continue; }
    done.push({ ...p, rid: String(r._id) });
    await logActivity({
      actorId: user.id, actorName: user.name ?? "", action: "create", targetType: "reservation",
      targetTitle: reservationLabel(p.name, startAt, endAt),
    });
  }
  const when = `${date.start.m}/${date.start.d} ${fmtT(startAt)}~${fmtT(endAt)}`;
  if (done.length === 0) return `❌ 같은 시간에 다른 예약이 동시에 접수됐어요. 예약현황 확인 후 다시 시도해주세요.`;
  const lostLine = lost.length > 0 ? `\n⚠ 동시 접수로 실패: ${esc(lost.join(", "))}` : "";
  return {
    text: `✅ <b>예약 완료</b> (${done.length}건)\n${done.map((p) => `· ${esc(p.name)}`).join("\n")}\n${when}${lostLine}`,
    html: true,
    // 장비별 취소 버튼 — 누르면 그 예약만 취소
    buttons: done.map((p) => [{ text: `↩ ${p.name} 취소`, data: `delres:${p.rid}` }]),
  };
}

// ── /오늘 /내일 ──
async function listDay(user: SessionUser, offset: number): Promise<TgReply> {
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
    return `· ${time} ${esc(t.title)}${team ? ` (${esc(team)})` : ""}${done}`;
  });
  return { text: `📅 <b>${label} 일정 ${tasks.length}건</b>\n${lines.join("\n")}`, html: true };
}

// ── /이번주 — 월~일 요일별 그룹 ──
const DAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];
async function listWeek(user: SessionUser): Promise<TgReply> {
  const kst = new Date(Date.now() + KST);
  const today = { y: kst.getUTCFullYear(), m: kst.getUTCMonth() + 1, d: kst.getUTCDate() };
  const monOff = -((kst.getUTCDay() + 6) % 7); // 이번 주 월요일까지의 오프셋
  const start = kstDate({ ...today, d: today.d + monOff }, 0, 0);
  const end = new Date(start.getTime() + 7 * 86_400_000);

  const q: any = { startDate: { $lt: end }, endDate: { $gt: start } };
  const scope = visibleTeamIds(user);
  if (scope !== "all") {
    if (scope.length === 0) return "소속 팀이 없어 조회할 일정이 없어요.";
    q.teamIds = { $in: scope };
  }
  const tasks: any[] = await Task.find(q).populate("teamIds", "name").sort({ allDay: -1, startDate: 1 }).limit(40).lean();
  if (tasks.length === 0) return "이번 주 등록된 일정이 없어요. 🎉";

  const fmtD = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  const parts: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(start.getTime() + i * 86_400_000);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const dayTasks = tasks.filter((t) => new Date(t.startDate) < dayEnd && new Date(t.endDate) > dayStart);
    if (dayTasks.length === 0) continue;
    const dKst = new Date(dayStart.getTime() + KST);
    const lines = dayTasks.map((t) => {
      const time = t.allDay ? "종일" : fmtT(t.startDate);
      const team = (t.teamIds ?? []).map((tm: any) => tm.name).join("·");
      return `· ${time} ${esc(t.title)}${team ? ` (${esc(team)})` : ""}${t.status === "done" ? " ✔" : ""}`;
    });
    parts.push(`<b>${DAY_LABEL[dKst.getUTCDay()]} ${fmtD(dKst)}</b>\n${lines.join("\n")}`);
  }
  const startKst = new Date(start.getTime() + KST);
  const endKst = new Date(startKst.getTime() + 6 * 86_400_000);
  return {
    text: `📅 <b>이번 주 일정</b> (${fmtD(startKst)}~${fmtD(endKst)}) ${tasks.length}건\n\n${parts.join("\n\n")}`,
    html: true,
  };
}

// ── /내일정 — 내가 담당인 미완료 업무 (마감 임박순, 지연 표시) ──
async function listMyTasks(user: SessionUser): Promise<TgReply> {
  const tasks: any[] = await Task.find({ assignees: user.id, status: { $in: ["todo", "in_progress"] } })
    .populate("teamIds", "name")
    .sort({ endDate: 1 })
    .limit(15)
    .lean();
  if (tasks.length === 0) return "담당 중인 미완료 업무가 없어요. 🎉";

  const now = Date.now();
  const lines = tasks.map((t, i) => {
    const end = new Date(t.endDate);
    // allDay는 UTC 자정으로 저장 → 그날 KST 24시(= UTC+15h)를 지나야 지연
    const overdue = now > end.getTime() + (t.allDay ? 15 * 3600_000 : 0);
    const d = t.allDay ? end : new Date(end.getTime() + KST);
    const dueStr = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    const team = (t.teamIds ?? []).map((tm: any) => tm.name).join("·");
    return `${i + 1}. ${overdue ? "⚠ " : ""}${dueStr}까지 ${esc(t.title)}${team ? ` (${esc(team)})` : ""}`;
  });
  return {
    text: `👤 <b>내 담당 업무 ${tasks.length}건</b>\n${lines.join("\n")}\n\n완료 처리는 <b>/완료 번호</b> (예: /완료 1)`,
    html: true,
  };
}

// ── /완료 — /내일정의 번호 또는 제목 일부로 완료 처리 ──
async function completeMyTask(user: SessionUser, args: string): Promise<TgReply> {
  const key = args.trim();
  if (!key) return "사용법: /완료 3 (번호는 /내일정에서 확인) 또는 /완료 제목 일부";
  // /내일정과 같은 정렬·범위로 다시 조회해 번호를 맞춘다
  const tasks: any[] = await Task.find({ assignees: user.id, status: { $in: ["todo", "in_progress"] } })
    .sort({ endDate: 1 })
    .limit(15)
    .lean();
  if (tasks.length === 0) return "담당 중인 미완료 업무가 없어요. 🎉";

  let target: any = null;
  if (/^\d+$/.test(key)) {
    const n = parseInt(key, 10);
    if (n < 1 || n > tasks.length) return `❌ ${n}번 업무가 없어요. /내일정으로 번호를 확인해주세요.`;
    target = tasks[n - 1];
  } else {
    const q = key.toLowerCase();
    const matches = tasks.filter((t) => (t.title ?? "").toLowerCase().includes(q));
    if (matches.length === 0) return `❌ "${key}" 제목의 담당 업무를 못 찾았어요. /내일정으로 확인해주세요.`;
    if (matches.length > 1) {
      return `❌ "${key}"에 ${matches.length}건이 걸려요: ${matches.slice(0, 3).map((t) => t.title).join(", ")}\n/내일정 번호로 지정해주세요.`;
    }
    target = matches[0];
  }

  const doc: any = await Task.findById(target._id);
  if (!doc) return "❌ 이미 삭제된 업무예요.";
  if (doc.status === "done") return "이미 완료된 업무예요.";
  doc.status = "done";
  await doc.save();
  await logActivity({ actorId: user.id, actorName: user.name ?? "", action: "status", targetTitle: doc.title, meta: { status: "done", detail: "텔레그램 /완료" } });
  return `✅ 완료 처리했어요: ${doc.title} 👏`;
}

// ── /검색 — 일정 제목 검색 (조회 범위는 역할에 따름, 최근 30일~미래) ──
async function searchTasks(user: SessionUser, keyword: string): Promise<TgReply> {
  const key = keyword.trim();
  if (!key) return "사용법: /검색 키워드 (예: /검색 촬영)";
  const safe = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // 정규식 이스케이프
  const q: any = {
    title: { $regex: safe, $options: "i" },
    endDate: { $gt: new Date(Date.now() - 30 * 86_400_000) },
  };
  const scope = visibleTeamIds(user);
  if (scope !== "all") {
    if (scope.length === 0) return "소속 팀이 없어 조회할 일정이 없어요.";
    q.teamIds = { $in: scope };
  }
  const tasks: any[] = await Task.find(q).populate("teamIds", "name").sort({ startDate: 1 }).limit(15).lean();
  if (tasks.length === 0) return `🔍 "${key}" 일정을 못 찾았어요. (최근 30일~미래 기준)`;

  const lines = tasks.map((t) => {
    const s = new Date(new Date(t.startDate).getTime() + KST);
    const dateStr = `${s.getUTCMonth() + 1}/${s.getUTCDate()}`;
    const time = t.allDay ? "" : ` ${fmtT(t.startDate)}`;
    const team = (t.teamIds ?? []).map((tm: any) => tm.name).join("·");
    return `· ${dateStr}${time} ${esc(t.title)}${team ? ` (${esc(team)})` : ""}${t.status === "done" ? " ✔" : ""}`;
  });
  return { text: `🔍 <b>"${esc(key)}" 검색 결과 ${tasks.length}건</b>\n${lines.join("\n")}`, html: true };
}

// ── /내예약 — 내 장비 예약 조회 + 반납·취소 버튼 ──
async function listMyReservations(user: SessionUser): Promise<TgReply> {
  const now = new Date();
  const list: any[] = await Reservation.find({
    reservedBy: user.id, status: "booked",
    endAt: { $gt: new Date(now.getTime() - 7 * 86_400_000) }, // 미반납(지난 7일)도 포함
  })
    .populate("resourceId", "name")
    .sort({ startAt: 1 })
    .limit(10)
    .lean();
  if (list.length === 0) return "예약 중인 장비가 없어요.";

  const fmtDT = (d: Date) => {
    const k = new Date(new Date(d).getTime() + KST);
    return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
  };
  const lines = list.map((r) => {
    const started = new Date(r.startAt) <= now;
    const overdue = now.getTime() > new Date(r.endAt).getTime() + 10 * 60_000;
    const st = overdue ? "⚠ 미반납" : started ? "사용 중" : "예정";
    return `· ${esc(r.resourceId?.name ?? "?")} ${fmtDT(r.startAt)}~${fmtDT(r.endAt)} — ${st}`;
  });
  // 사용 중(수령 후)은 반납 버튼, 예정은 취소 버튼
  const buttons: TgButton[][] = list.slice(0, 8).map((r) => {
    const started = new Date(r.startAt) <= now;
    const name = r.resourceId?.name ?? "장비";
    return [started
      ? { text: `✅ ${name} 반납 처리`, data: `ret:${String(r._id)}` }
      : { text: `↩ ${name} 예약 취소`, data: `delres:${String(r._id)}` }];
  });
  return { text: `📦 <b>내 예약 ${list.length}건</b>\n${lines.join("\n")}`, html: true, buttons };
}

// ── 인라인 버튼 콜백 처리 ──
// data 형식 — undo:<taskId> 방금 등록 취소 / pundo:<id> 개인일정 취소 / done:<taskId> 업무 완료 /
//            delres:<rid> 예약 취소 / ret:<rid> 반납 처리
export async function handleTelegramCallback(p: {
  fromId: string; // 누른 사람의 개인 텔레그램 ID (그룹방에서도 개인 식별)
  chatId: string;
  messageId: number;
  messageText: string; // 원본 메시지 (처리 결과를 덧붙여 수정)
  data: string;
  callbackId: string;
}): Promise<void> {
  await connectDB();
  const [action, id] = p.data.split(":");
  // 처리 결과를 원본 메시지에 덧붙이고 버튼 제거 (수정된 메시지는 플레인 텍스트)
  const finish = async (toast: string, suffix?: string) => {
    await answerCallback(p.callbackId, toast);
    if (suffix) await editTelegramMessage(p.chatId, p.messageId, `${p.messageText}\n\n${suffix}`);
  };

  const userDoc: any = await User.findOne({ telegramChatId: p.fromId, status: "active" }).sort({ updatedAt: -1 }).lean();
  if (!userDoc) { await answerCallback(p.callbackId, "계정 연동이 필요해요. 설정에서 연동 후 이용해주세요."); return; }
  const user = toSessionUser(userDoc);

  try {
    if (action === "undo") {
      const task: any = await Task.findById(id);
      if (!task) { await finish("이미 삭제된 일정이에요.", "↩ 이미 취소된 일정입니다."); return; }
      const teamIds = (task.teamIds ?? []).map(String);
      if (!canDeleteTaskDoc(user, teamIds, task.createdBy ? String(task.createdBy) : null)) {
        await answerCallback(p.callbackId, "취소 권한이 없어요."); return;
      }
      await cancelTaskReservations([task._id]);
      await Task.deleteOne({ _id: task._id });
      await logActivity({ actorId: user.id, actorName: user.name ?? "", action: "delete", targetTitle: `${task.title} (텔레그램 등록 취소)` });
      await finish("등록을 취소했어요.", `↩ 등록이 취소되었습니다. (${user.name ?? ""})`);
      return;
    }

    if (action === "pundo") {
      const ev: any = await PersonalEvent.findById(id);
      if (!ev) { await finish("이미 삭제된 일정이에요.", "↩ 이미 취소된 일정입니다."); return; }
      if (String(ev.userId) !== user.id) { await answerCallback(p.callbackId, "본인 개인 일정만 취소할 수 있어요."); return; }
      await PersonalEvent.deleteOne({ _id: ev._id });
      await touchChanged("personal");
      await finish("등록을 취소했어요.", `↩ 개인 일정 등록이 취소되었습니다. (${user.name ?? ""})`);
      return;
    }

    if (action === "done") {
      const task: any = await Task.findById(id);
      if (!task) { await finish("이미 삭제된 업무예요.", "⚠ 삭제된 업무입니다."); return; }
      if (task.status === "done") { await answerCallback(p.callbackId, "이미 완료된 업무예요."); return; }
      const teamIds = (task.teamIds ?? []).map(String);
      const assignees = (task.assignees ?? []).map(String);
      if (!canChangeStatusAny(user, teamIds, assignees)) {
        await answerCallback(p.callbackId, "완료 처리 권한이 없어요."); return;
      }
      task.status = "done";
      await task.save();
      await logActivity({ actorId: user.id, actorName: user.name ?? "", action: "status", targetTitle: task.title, meta: { status: "done", detail: "텔레그램에서 완료" } });
      await finish("완료 처리했어요! 👏", `✅ 완료 처리됨 — ${user.name ?? ""}`);
      return;
    }

    if (action === "delres") {
      const r: any = await Reservation.findById(id);
      if (!r || r.status !== "booked") { await finish("이미 처리된 예약이에요.", "↩ 이미 취소·처리된 예약입니다."); return; }
      if (String(r.reservedBy) !== user.id && user.role !== "admin") {
        await answerCallback(p.callbackId, "본인 예약만 취소할 수 있어요."); return;
      }
      r.status = "cancelled";
      await r.save();
      const res: any = await Resource.findById(r.resourceId).select("name").lean();
      await logActivity({
        actorId: user.id, actorName: user.name ?? "", action: "delete", targetType: "reservation",
        targetTitle: reservationLabel(res?.name ?? "자원", r.startAt, r.endAt), meta: { detail: "예약 취소 (텔레그램)" },
      });
      await finish("예약을 취소했어요.", `↩ ${res?.name ?? "장비"} 예약이 취소되었습니다. (${user.name ?? ""})`);
      return;
    }

    if (action === "ret") {
      const r: any = await Reservation.findById(id);
      if (!r) { await answerCallback(p.callbackId, "예약을 찾을 수 없어요."); return; }
      if (r.status === "returned") { await answerCallback(p.callbackId, "이미 반납 처리된 예약이에요."); return; }
      if (r.status !== "booked") { await answerCallback(p.callbackId, "취소된 예약은 반납할 수 없어요."); return; }
      const res: any = await Resource.findById(r.resourceId).select("name managerId").lean();
      if (!canMarkReturned(user, String(r.reservedBy), res?.managerId ? String(res.managerId) : null)) {
        await answerCallback(p.callbackId, "반납 처리 권한이 없어요. (예약자·관리 담당자·과장단)"); return;
      }
      const now = new Date();
      const late = now.getTime() > new Date(r.endAt).getTime() + 10 * 60_000;
      r.status = "returned";
      r.returnedAt = now;
      r.returnedBy = user.id;
      await r.save();
      const label = reservationLabel(res?.name ?? "자원", r.startAt, r.endAt);
      await logActivity({
        actorId: user.id, actorName: user.name ?? "", action: "status", targetType: "reservation",
        targetTitle: label, meta: { detail: late ? "지연 반납 (텔레그램)" : "반납 완료 (텔레그램)" },
      });
      // 웹 반납과 동일 — 예약자·관리 담당자에게 알림 (처리한 본인 제외)
      const recipients = [String(r.reservedBy), res?.managerId ? String(res.managerId) : ""]
        .filter((uid) => uid && uid !== user.id);
      await notify(recipients, {
        type: "reservation",
        title: late ? "⏰ 장비가 지연 반납되었습니다" : "✅ 장비가 반납되었습니다",
        body: `${label} — ${user.name ?? ""} 님이 반납 처리`,
        link: "/resources",
      });
      await finish("반납 처리했어요!", `✅ 반납 처리됨 — ${user.name ?? ""}${late ? " (지연)" : ""}`);
      return;
    }

    await answerCallback(p.callbackId, "알 수 없는 동작이에요.");
  } catch (e) {
    console.error("[telegram] 콜백 처리 오류:", e);
    await answerCallback(p.callbackId, "처리 중 오류가 발생했어요.");
  }
}

// ── /예약현황 ──
async function listReservations(dateArg: string): Promise<TgReply> {
  const d = parseOneDate(dateArg, new Date());
  if (!d) return "사용법: /예약현황 7/20 (생략하면 오늘)";
  const start = kstDate(d, 0, 0);
  const end = kstDate(d, 24, 0);
  const list: any[] = await Reservation.find({ status: "booked", startAt: { $lt: end }, endAt: { $gt: start } })
    .populate("resourceId", "name").populate("teamId", "name").populate("reservedBy", "name")
    .sort({ startAt: 1 }).limit(20).lean();
  if (list.length === 0) return `${d.m}/${d.d} 예약이 없어요.`;
  const lines = list.map((r) =>
    `· ${esc(r.resourceId?.name ?? "?")} ${fmtT(r.startAt)}~${fmtT(r.endAt)} (${esc(r.teamId?.name ?? "?")} ${esc(r.reservedBy?.name ?? "")})`
  );
  return { text: `📦 <b>${d.m}/${d.d} 장비 예약 ${list.length}건</b>\n${lines.join("\n")}`, html: true };
}
