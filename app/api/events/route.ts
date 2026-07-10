import { connectDB } from "@/lib/mongodb";
import { Event } from "@/models/Event";
import "@/models/Team";
import "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canManageEvents } from "@/lib/permissions";
import { eventCreateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";

function serializeEvent(e: any) {
  return {
    id: String(e._id),
    title: e.title,
    description: e.description,
    stage: e.stage,
    teams: (e.teamIds ?? [])
      .filter(Boolean)
      .map((tm: any) => ({ id: String(tm._id ?? tm), name: tm.name ?? "", color: tm.color ?? "#8b95a1" })),
    manager: e.managerId?.name
      ? { id: String(e.managerId._id ?? e.managerId), name: e.managerId.name }
      : null,
    eventDate: e.eventDate,
    location: e.location,
    priority: e.priority,
    checklist: (e.checklist ?? []).map((c: any) => ({ id: String(c._id), text: c.text, done: !!c.done })),
    createdBy: e.createdBy ? String(e.createdBy._id ?? e.createdBy) : null,
    createdAt: e.createdAt,
  };
}

// GET /api/events — 행사 전체 (공유 보드: 모든 활성 유저 조회)
export async function GET() {
  const { error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const list = await Event.find()
    .populate("teamIds", "name color")
    .populate("managerId", "name")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  return json({ events: list.map(serializeEvent) });
}

// POST /api/events — 행사 등록 (편집자 역할)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageEvents(user)) return json({ error: "행사를 등록할 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = eventCreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const d = parsed.data;
  await connectDB();
  const created = await Event.create({
    title: d.title,
    description: d.description,
    teamIds: d.teamIds,
    managerId: d.managerId || null,
    eventDate: d.eventDate ? new Date(d.eventDate) : null,
    location: d.location,
    priority: d.priority,
    checklist: d.checklist,
    createdBy: user.id,
  });
  await logActivity({ actorId: user.id, actorName: user.name, action: "create", targetType: "event", targetTitle: created.title });
  return json({ id: String(created._id) }, 201);
}
