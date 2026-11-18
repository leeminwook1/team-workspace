import { connectDB } from "./mongodb";
import { Task } from "@/models/Task";
import { Category } from "@/models/Category";
import { User } from "@/models/User";
import { esc, sendTelegram, telegramEnabled } from "./telegram";

// 주간 촬영 보고 — 지난주 촬영 + 이번 주 촬영 예정 (날짜·시간·장소·촬영 인원)
// "촬영" = 촬영 카테고리 일정 또는 촬영 진행 관리가 켜진 일정 (통계와 같은 기준). 주는 월~일(KST), 시작일 기준.
// 쓰는 곳: 텔레그램 /주간보고, 매주 월요일 09시 크론 → 과장·부과장

const KST = 9 * 3600_000;
const DAY = 86_400_000;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_PER_WEEK = 15; // 텔레그램 4096자 제한 — 넘으면 "외 N건"

const k = (d: Date) => new Date(new Date(d).getTime() + KST); // KST 벽시계 (getUTC* 로 읽기)
const md = (d: Date) => { const x = k(d); return `${x.getUTCMonth() + 1}/${x.getUTCDate()}(${DOW[x.getUTCDay()]})`; };
const hm = (d: Date) => { const x = k(d); return `${String(x.getUTCHours()).padStart(2, "0")}:${String(x.getUTCMinutes()).padStart(2, "0")}`; };
const sameDay = (a: Date, b: Date) => k(a).toISOString().slice(0, 10) === k(b).toISOString().slice(0, 10);

/** 이번 주 월요일 00:00 (KST) 시각 */
export function weekStart(now = new Date()) {
  const x = k(now);
  const back = (x.getUTCDay() + 6) % 7; // 월=0 … 일=6
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate() - back) - KST);
}

type Shoot = { title: string; startDate: Date; endDate: Date; allDay: boolean; location: string; status: string; people: string[] };

async function loadShoots(from: Date, to: Date): Promise<Shoot[]> {
  const shootCats = (await Category.find({ name: /촬영/ }).select("_id").lean()).map((c: any) => c._id);
  const list: any[] = await Task.find({
    startDate: { $gte: from, $lt: to },
    $or: [{ categoryId: { $in: shootCats } }, { "pipeline.on": true }],
  }).select("title startDate endDate allDay location status assignees")
    .populate("assignees", "name").sort({ startDate: 1 }).lean();
  return list.map((t) => ({
    title: t.title, startDate: t.startDate, endDate: t.endDate, allDay: !!t.allDay,
    location: t.location ?? "", status: t.status ?? "todo",
    people: (t.assignees ?? []).map((a: any) => a?.name).filter(Boolean),
  }));
}

function whenText(s: Shoot) {
  const multi = !sameDay(s.startDate, s.endDate);
  if (s.allDay) return multi ? `${md(s.startDate)}~${md(s.endDate)} 종일` : `${md(s.startDate)} 종일`;
  return multi ? `${md(s.startDate)} ${hm(s.startDate)} ~ ${md(s.endDate)} ${hm(s.endDate)}` : `${md(s.startDate)} ${hm(s.startDate)}–${hm(s.endDate)}`;
}

function section(title: string, from: Date, shoots: Shoot[]) {
  const to = new Date(from.getTime() + 6 * DAY);
  const head = `<b>▣ ${title}</b>  ${md(from)}~${md(to)} · <b>${shoots.length}건</b>`;
  if (shoots.length === 0) return `${head}\n  촬영 없음`;

  const lines = shoots.slice(0, MAX_PER_WEEK).map((s, i) => {
    const hold = s.status === "hold" ? " (보류)" : "";
    const meta = [
      s.location ? `📍 ${esc(s.location)}` : "",
      s.people.length ? `👥 ${esc(s.people.join(", "))} (${s.people.length}명)` : "👥 담당 미정",
    ].filter(Boolean).join("  ");
    return `${i + 1}. <b>${whenText(s)}</b>\n    ${esc(s.title)}${hold}\n    ${meta}`;
  });
  if (shoots.length > MAX_PER_WEEK) lines.push(`    … 외 ${shoots.length - MAX_PER_WEEK}건 (웹 달력에서 확인)`);

  // 사람별 촬영 횟수 — 많은 순
  const count = new Map<string, number>();
  for (const s of shoots) for (const p of s.people) count.set(p, (count.get(p) ?? 0) + 1);
  const total = Array.from(count.values()).reduce((a, b) => a + b, 0);
  const crew = count.size
    ? `\n  👥 촬영 인원 ${count.size}명 (연 ${total}명) — ${Array.from(count.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).map(([n, c]) => `${esc(n)} ${c}`).join(" · ")}`
    : "";
  return `${head}${crew}\n\n${lines.join("\n\n")}`;
}

/** 텔레그램 HTML 본문 */
export async function buildWeeklyReport(now = new Date()) {
  await connectDB();
  const thisMon = weekStart(now);
  const lastMon = new Date(thisMon.getTime() - 7 * DAY);
  const nextMon = new Date(thisMon.getTime() + 7 * DAY);
  const [last, cur] = await Promise.all([loadShoots(lastMon, thisMon), loadShoots(thisMon, nextMon)]);

  const text = [
    `📋 <b>주간 촬영 보고</b> — ${md(now)} 기준`,
    section("지난주 촬영", lastMon, last),
    section("이번 주 촬영 예정", thisMon, cur),
  ].join("\n\n━━━━━━━━━━━━\n\n");
  // 안전장치 — 그래도 길면 잘라서 보냄 (텔레그램 4096자)
  return text.length > 4000 ? `${text.slice(0, 3980)}\n…` : text;
}

/** 매주 월요일 크론 — 과장·부과장(주간 보고 수신 켠 사람)에게 발송. 보낸 인원 수 반환 */
export async function sendWeeklyReports(now = new Date()) {
  if (!telegramEnabled()) return 0;
  await connectDB();
  const leaders: any[] = await User.find({
    status: "active", role: { $in: ["leader", "vice_leader"] }, telegramChatId: { $nin: ["", null] },
    "notifyPrefs.weekly": { $ne: false },
  }).select("telegramChatId").lean();
  if (leaders.length === 0) return 0;
  const text = await buildWeeklyReport(now);
  let sent = 0;
  for (const u of leaders) if (await sendTelegram(u.telegramChatId, text, { html: true })) sent += 1;
  return sent;
}
