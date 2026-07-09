import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import "@/models/Team";
import "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canCreateTask, visibleTeamIds } from "@/lib/permissions";
import { taskCreateSchema } from "@/lib/validations";

function serialize(t: any) {
  return {
    id: String(t._id),
    title: t.title,
    description: t.description,
    team: t.teamId
      ? { id: String(t.teamId._id ?? t.teamId), name: t.teamId.name, color: t.teamId.color }
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

  // 설계 3.2 — 전사 역할은 전체, 그 외는 소속 팀만
  const scope = visibleTeamIds(user);
  if (scope === "all") {
    if (team) q.teamId = team;
  } else {
    if (scope.length === 0) return json({ tasks: [] });
    q.teamId = team && scope.includes(team) ? team : { $in: scope };
  }

  const tasks = await Task.find(q)
    .populate("teamId", "name color")
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
  if (!canCreateTask(user, d.teamId)) {
    return json({ error: "이 팀에 업무를 등록할 권한이 없습니다." }, 403);
  }
  if (new Date(d.endDate) < new Date(d.startDate)) {
    return json({ error: "종료일이 시작일보다 빠를 수 없습니다." }, 400);
  }

  await connectDB();
  const task = await Task.create({
    ...d,
    startDate: new Date(d.startDate),
    endDate: new Date(d.endDate),
    createdBy: user.id,
  });
  return json({ id: String(task._id) }, 201);
}
