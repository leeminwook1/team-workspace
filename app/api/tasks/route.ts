import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import "@/models/Team";
import "@/models/User";
import "@/models/Category";
import { requireActiveUser, json } from "@/lib/api";
import { canCreateTaskInAll, visibleTeamIds } from "@/lib/permissions";
import { taskCreateSchema } from "@/lib/validations";

function serialize(t: any) {
  return {
    id: String(t._id),
    title: t.title,
    description: t.description,
    teams: (t.teamIds ?? [])
      .filter(Boolean)
      .map((tm: any) => ({ id: String(tm._id ?? tm), name: tm.name ?? "", color: tm.color ?? "#8b95a1" })),
    category: t.categoryId
      ? { id: String(t.categoryId._id ?? t.categoryId), name: t.categoryId.name ?? "", color: t.categoryId.color ?? "#8b95a1" }
      : null,
    assignees: (t.assignees ?? []).map((a: any) => ({
      id: String(a._id ?? a),
      name: a.name ?? "",
    })),
    createdBy: String(t.createdBy),
    startDate: t.startDate,
    endDate: t.endDate,
    allDay: t.allDay,
    status: t.status,
    priority: t.priority,
    location: t.location,
  };
}

// GET /api/tasks?from=&to=&team= — 기간·팀별 업무 조회 (조회 범위는 역할에 따름)
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const team = url.searchParams.get("team");

  await connectDB();
  const q: any = {};
  if (from && to) {
    q.startDate = { $lt: new Date(to) };
    q.endDate = { $gt: new Date(from) };
  }

  // 설계 3.2 — 전사 역할은 전체, 그 외는 소속 팀만 (teamIds 배열에 하나라도 포함되면 매치)
  const scope = visibleTeamIds(user);
  if (scope === "all") {
    if (team) q.teamIds = team;
  } else {
    if (scope.length === 0) return json({ tasks: [] });
    q.teamIds = team && scope.includes(team) ? team : { $in: scope };
  }

  const tasks = await Task.find(q)
    .populate("teamIds", "name color")
    .populate("categoryId", "name color")
    .populate("assignees", "name")
    .sort({ startDate: 1 })
    .lean();

  return json({ tasks: tasks.map(serialize) });
}

// POST /api/tasks — 업무 등록 (팀장·부팀장·과장·부과장·Admin)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const d = parsed.data;
  if (!canCreateTaskInAll(user, d.teamIds)) {
    return json({ error: "선택한 팀 중 등록 권한이 없는 팀이 있습니다." }, 403);
  }
  if (new Date(d.endDate) < new Date(d.startDate)) {
    return json({ error: "종료가 시작보다 빠를 수 없습니다." }, 400);
  }

  await connectDB();
  const task = await Task.create({
    ...d,
    categoryId: d.categoryId || null,
    startDate: new Date(d.startDate),
    endDate: new Date(d.endDate),
    createdBy: user.id,
  });
  return json({ id: String(task._id) }, 201);
}
