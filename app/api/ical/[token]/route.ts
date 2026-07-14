import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { Task } from "@/models/Task";
import { PersonalEvent } from "@/models/PersonalEvent";
import { Absence } from "@/models/Absence";
import "@/models/Team";
import { ABSENCE_LABEL, type AbsenceType } from "@/lib/absenceTypes";

export const dynamic = "force-dynamic";

// ── iCal(.ics) 유틸 — 특수문자 이스케이프 + 75바이트 줄 접기(RFC 5545) ──
function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function fold(line: string) {
  // 바이트 기준으로 접어야 한글이 깨지지 않는다
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 74) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + 74, bytes.length);
    // UTF-8 문자 중간에서 자르지 않게 뒤로 물림 (연속 바이트 0b10xxxxxx)
    while (end < bytes.length && end > start && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.slice(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n "); // 이어지는 줄은 공백 한 칸으로 시작
}
const pad = (n: number) => String(n).padStart(2, "0");
// 종일 일정 — 저장된 UTC 자정 Date에서 날짜만 (YYYYMMDD)
function icsDate(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
// 날짜에 일 수 더하기 (DTEND는 exclusive라 마지막 날 +1)
function icsDatePlus(d: Date, days: number) {
  const x = new Date(d.getTime() + days * 86_400_000);
  return icsDate(x);
}
// 시간 지정 일정 — UTC 인스턴트 (캘린더 앱이 사용자 시간대로 변환)
function icsDateTime(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function vevent(fields: { uid: string; summary: string; allDay: boolean; start: Date; end: Date; endInclusive?: boolean; location?: string; description?: string; stamp: Date }) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${fields.uid}`,
    `DTSTAMP:${icsDateTime(fields.stamp)}`,
    ...(fields.allDay
      ? [
          `DTSTART;VALUE=DATE:${icsDate(fields.start)}`,
          `DTEND;VALUE=DATE:${fields.endInclusive ? icsDatePlus(fields.end, 1) : icsDate(fields.end)}`,
        ]
      : [`DTSTART:${icsDateTime(fields.start)}`, `DTEND:${icsDateTime(fields.end)}`]),
    `SUMMARY:${icsEscape(fields.summary)}`,
    ...(fields.location ? [`LOCATION:${icsEscape(fields.location)}`] : []),
    ...(fields.description ? [`DESCRIPTION:${icsEscape(fields.description)}`] : []),
    "END:VEVENT",
  ];
  return lines.map(fold).join("\r\n");
}

// GET /api/ical/:token — 개인 통합 iCal 피드 (내 담당 업무 + 개인 일정 + 내 부재)
// 캘린더 앱(구글·애플)이 주기적으로 읽어가는 공개 URL — 토큰이 곧 인증 (설정에서 재발급 시 무효화)
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!/^[0-9a-f]{40}$/.test(token)) return new Response("Not found", { status: 404 });

  await connectDB();
  const me: any = await User.findOne({ icalToken: token, status: "active" }).select("name").lean();
  if (!me) return new Response("Not found", { status: 404 });

  const from = new Date(Date.now() - 60 * 86_400_000); // 지난 60일
  const to = new Date(Date.now() + 365 * 86_400_000); // 1년 뒤까지

  const [tasks, personals, absences]: [any[], any[], any[]] = await Promise.all([
    Task.find({ assignees: me._id, startDate: { $lt: to }, endDate: { $gt: from } })
      .populate("teamIds", "name").select("title startDate endDate allDay location status teamIds updatedAt").lean(),
    PersonalEvent.find({ userId: me._id, startDate: { $lt: to }, endDate: { $gt: from } })
      .select("title startDate endDate allDay location memo updatedAt").lean(),
    Absence.find({ userId: me._id, startDate: { $lt: to }, endDate: { $gte: from } })
      .select("type startDate endDate note updatedAt").lean(),
  ]);

  const events: string[] = [];
  for (const t of tasks) {
    const team = (t.teamIds ?? []).map((x: any) => x.name).filter(Boolean).join("·");
    events.push(vevent({
      uid: `task-${String(t._id)}@chq`,
      summary: `${t.status === "done" ? "✔ " : ""}${t.title}${team ? ` [${team}]` : ""}`,
      allDay: !!t.allDay,
      start: new Date(t.startDate), end: new Date(t.endDate), endInclusive: !!t.allDay,
      location: t.location || undefined,
      stamp: new Date(t.updatedAt ?? Date.now()),
    }));
  }
  for (const p of personals) {
    events.push(vevent({
      uid: `personal-${String(p._id)}@chq`,
      summary: p.title,
      allDay: !!p.allDay,
      start: new Date(p.startDate), end: new Date(p.endDate), endInclusive: !!p.allDay,
      location: p.location || undefined,
      description: p.memo || undefined,
      stamp: new Date(p.updatedAt ?? Date.now()),
    }));
  }
  for (const a of absences) {
    events.push(vevent({
      uid: `absence-${String(a._id)}@chq`,
      summary: `🏖 ${ABSENCE_LABEL[a.type as AbsenceType] ?? a.type}`,
      allDay: true,
      start: new Date(a.startDate), end: new Date(a.endDate), endInclusive: true,
      description: a.note || undefined,
      stamp: new Date(a.updatedAt ?? Date.now()),
    }));
  }

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CHQ//Culture HQ Calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:CHQ — ${icsEscape(me.name ?? "내 일정")}`),
    "X-WR-TIMEZONE:Asia/Seoul",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n";

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="chq.ics"',
      // 캘린더 앱이 수 시간 간격으로 읽어감 — 5분 캐시로 서버 부담 최소화
      "Cache-Control": "public, s-maxage=300, max-age=300",
    },
  });
}
