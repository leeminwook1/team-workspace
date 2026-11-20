import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { addInterval } from "@/lib/recurrence";
import { dateOccurrences } from "@/lib/repeatRule";
import { PersonalEvent } from "@/models/PersonalEvent";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canViewPersonalCalendar } from "@/lib/permissions";
import { personalEventSchema } from "@/lib/validations";
import { touchChanged } from "@/lib/changes";

function serialize(e: any) {
  return {
    id: String(e._id),
    title: e.title,
    memo: e.memo ?? "",
    location: e.location ?? "",
    startDate: e.startDate,
    endDate: e.endDate,
    allDay: e.allDay,
    recurrenceId: e.recurrenceId ? String(e.recurrenceId) : null,
    repeatFreq: e.repeatFreq ?? null,
  };
}

// GET /api/personal-events?from=&to=&user= — 개인 일정 조회
// user 생략 = 내 것. user 지정 = 같은 팀 팀장 또는 admin만 (읽기 전용 열람)
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const targetId = url.searchParams.get("user") || user.id;

  await connectDB();
  if (targetId !== user.id) {
    const target: any = await User.findById(targetId).select("teamId status role").lean();
    if (!target || target.status !== "active") return json({ error: "사용자를 찾을 수 없습니다." }, 404);
    if (!canViewPersonalCalendar(user, { id: targetId, teamId: target.teamId ? String(target.teamId) : null, role: target.role })) {
      return json({ error: "이 사용자의 개인 캘린더를 볼 권한이 없습니다." }, 403);
    }
  }

  const q: any = { userId: targetId };
  if (from && to) {
    q.startDate = { $lt: new Date(to) };
    q.endDate = { $gt: new Date(from) };
  }
  const events = await PersonalEvent.find(q).sort({ startDate: 1 }).limit(500).lean();
  return json({ events: events.map(serialize), readOnly: targetId !== user.id });
}

// POST /api/personal-events — 내 개인 일정 등록 (본인만)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = personalEventSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
  const d = parsed.data;

  const startDate = new Date(d.startDate);
  const endDate = new Date(d.endDate);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return json({ error: "날짜 형식이 잘못됐습니다." }, 400);
  if (endDate < startDate) return json({ error: "종료가 시작보다 빠를 수 없습니다." }, 400);

  const { repeat, repeatUntil, repeatDates, ...fields } = d;
  await connectDB();
  if (!repeat || repeat === "none") {
    const e = await PersonalEvent.create({ ...fields, userId: user.id, startDate, endDate });
    await touchChanged("personal");
    return json({ id: String(e._id) }, 201);
  }

  // 날짜 직접 지정 — 고른 날짜마다 같은 시각으로 (시작일 포함)
  if (repeat === "dates") {
    const occ = dateOccurrences(startDate, endDate, d.allDay, repeatDates ?? []);
    if ("error" in occ) return json({ error: occ.error }, 400);
    if (occ.list.length < 2) return json({ error: "반복할 날짜를 하나 이상 더 골라주세요." }, 400);
    const recurrenceId = new mongoose.Types.ObjectId();
    const created = await PersonalEvent.insertMany(occ.list.map((o) => ({ ...fields, userId: user.id, recurrenceId, repeatFreq: "dates", startDate: o.startDate, endDate: o.endDate })));
    await touchChanged("personal");
    return json({ id: String(created[0]._id), count: created.length }, 201);
  }

  // 반복 — 종료일(기본 3개월, 최대 1년)까지 회차를 한 번에 생성
  const maxUntil = addInterval(startDate, "monthly", 12);
  const until = repeatUntil ? new Date(repeatUntil) : addInterval(startDate, "monthly", 3);
  if (isNaN(until.getTime()) || until < new Date(startDate.getTime() - 86_400_000)) return json({ error: "반복 종료일이 시작일보다 빠를 수 없습니다." }, 400);
  if (until > maxUntil) return json({ error: "반복은 최대 1년까지 설정할 수 있어요." }, 400);
  const untilEnd = new Date(until.getTime() + 86_400_000); // 종료일 그날 포함
  const duration = endDate.getTime() - startDate.getTime();
  const recurrenceId = new mongoose.Types.ObjectId();
  const docs: any[] = [];
  for (let i = 0; i < 400; i++) {
    const s = addInterval(startDate, repeat, i);
    if (s >= untilEnd) break;
    docs.push({ ...fields, userId: user.id, recurrenceId, repeatFreq: repeat, startDate: s, endDate: new Date(s.getTime() + duration) });
  }
  const created = await PersonalEvent.insertMany(docs);
  await touchChanged("personal");
  return json({ id: String(created[0]._id), count: created.length }, 201);
}
