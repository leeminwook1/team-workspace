import { connectDB } from "@/lib/mongodb";
import { PersonalEvent } from "@/models/PersonalEvent";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canViewPersonalCalendar } from "@/lib/permissions";
import { personalEventSchema } from "@/lib/validations";

function serialize(e: any) {
  return {
    id: String(e._id),
    title: e.title,
    memo: e.memo ?? "",
    location: e.location ?? "",
    startDate: e.startDate,
    endDate: e.endDate,
    allDay: e.allDay,
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
    const target: any = await User.findById(targetId).select("teamId status").lean();
    if (!target || target.status !== "active") return json({ error: "사용자를 찾을 수 없습니다." }, 404);
    if (!canViewPersonalCalendar(user, { id: targetId, teamId: target.teamId ? String(target.teamId) : null })) {
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

  await connectDB();
  const e = await PersonalEvent.create({ ...d, userId: user.id, startDate, endDate });
  return json({ id: String(e._id) }, 201);
}
