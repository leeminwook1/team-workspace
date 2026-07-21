import { connectDB } from "@/lib/mongodb";
import { PersonalEvent } from "@/models/PersonalEvent";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canViewPersonalCalendar, canViewAllTeams } from "@/lib/permissions";

// GET /api/personal-events/overlay?team=&from=&to= — 팀원 개인일정 겹쳐보기
// 팀장: 자기 팀. 전사 역할(admin·과장·부과장·서기): 팀 선택 가능.
// 개인 캘린더 열람 규칙을 멤버별로 그대로 적용 — 권한 없는 멤버는 hidden 목록으로 안내.
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const teamParam = url.searchParams.get("team");

  let teamId: string | null = null;
  if (canViewAllTeams(user)) {
    teamId = teamParam || null;
  } else if (user.role === "leader" || user.role === "vice_leader") {
    teamId = user.teamId; // 팀 리더는 자기 팀만
  }
  if (!teamId) return json({ error: "조회할 팀이 없습니다." }, 400);

  await connectDB();
  const members: any[] = await User.find({ teamId, status: "active" })
    .select("name role teamId").sort({ name: 1 }).lean();

  const visible = members.filter((m) =>
    canViewPersonalCalendar(user, { id: String(m._id), teamId: String(m.teamId), role: m.role })
  );
  const hidden = members.filter((m) => !visible.includes(m)).map((m) => m.name);

  const q: any = { userId: { $in: visible.map((m) => m._id) } };
  if (from && to) {
    q.startDate = { $lt: new Date(to) };
    q.endDate = { $gt: new Date(from) };
  }
  const events = await PersonalEvent.find(q).sort({ startDate: 1 }).limit(1000).lean();

  return json({
    members: visible.map((m) => ({ id: String(m._id), name: m.name, role: m.role })),
    hidden, // 열람 권한이 없어 표시하지 못한 멤버 이름
    events: events.map((e: any) => ({
      id: String(e._id),
      userId: String(e.userId),
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate,
      allDay: e.allDay,
      // 상세보기용 — 열람 권한(canViewPersonalCalendar)을 이미 통과한 멤버의 일정만 담긴다
      location: e.location ?? "",
      memo: e.memo ?? "",
    })),
  });
}
