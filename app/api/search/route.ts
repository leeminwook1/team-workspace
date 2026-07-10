import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import { Event } from "@/models/Event";
import { Directive } from "@/models/Directive";
import "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { visibleTeamIds, canUseDirectives, canCreateDirective } from "@/lib/permissions";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/search?q= — 업무·행사·TODO 통합 검색 (각 5건, 권한 범위 내)
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return json({ tasks: [], events: [], directives: [] });
  const rx = new RegExp(escapeRegex(q), "i");

  await connectDB();

  // 업무 — 조회 범위(역할) 적용
  const scope = visibleTeamIds(user);
  const taskQ: any = { $or: [{ title: rx }, { location: rx }] };
  if (scope !== "all") {
    if (scope.length === 0) taskQ.teamIds = { $in: [] };
    else taskQ.teamIds = { $in: scope };
  }
  const tasks = await Task.find(taskQ)
    .populate("teamIds", "name color")
    .sort({ startDate: -1 })
    .limit(5)
    .lean();

  // 행사 — 전체 공유 보드
  const events = await Event.find({ $or: [{ title: rx }, { location: rx }, { description: rx }] })
    .populate("teamIds", "name color")
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  // TODO — 지시함 조회 규칙과 동일
  let directives: any[] = [];
  if (canUseDirectives(user)) {
    const dirQ: any = { $or: [{ title: rx }, { body: rx }] };
    if (!canCreateDirective(user)) {
      if (user.teamId) dirQ.teamId = user.teamId;
      else dirQ.teamId = null; // 팀 없는 비발신자는 결과 없음
    }
    directives = await Directive.find(dirQ)
      .populate("teamId", "name color")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
  }

  const team = (t: any) => (t?.name ? { name: t.name, color: t.color ?? "#8b95a1" } : null);
  return json({
    tasks: tasks.map((t: any) => ({
      id: String(t._id), title: t.title,
      date: t.startDate, allDay: !!t.allDay,
      teams: (t.teamIds ?? []).filter(Boolean).map(team).filter(Boolean),
    })),
    events: events.map((e: any) => ({
      id: String(e._id), title: e.title, eventDate: e.eventDate,
      teams: (e.teamIds ?? []).filter(Boolean).map(team).filter(Boolean),
      itemsTotal: (e.items ?? []).length,
    })),
    directives: directives.map((d: any) => ({
      id: String(d._id), title: d.title, status: d.status, dueDate: d.dueDate,
      team: team(d.teamId),
    })),
  });
}
