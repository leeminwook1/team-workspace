import { connectDB } from "@/lib/mongodb";
import { Event } from "@/models/Event";
import "@/models/Team";
import "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canManageEvents } from "@/lib/permissions";
import { eventCreateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";

// 목록용 요약 (투두 진행률 포함, items 본문은 제외)
function serializeSummary(e: any) {
  const items = e.items ?? [];
  return {
    id: String(e._id),
    title: e.title,
    stageless: true,
    teams: (e.teamIds ?? []).filter(Boolean).map((tm: any) => ({ id: String(tm._id ?? tm), name: tm.name ?? "", color: tm.color ?? "#8b95a1" })),
    manager: e.managerId?.name ? { id: String(e.managerId._id ?? e.managerId), name: e.managerId.name } : null,
    eventDate: e.eventDate,
    location: e.location,
    priority: e.priority,
    itemsTotal: items.length,
    itemsDone: items.filter((it: any) => it.status === "done").length,
    createdAt: e.createdAt,
    closedAt: e.closedAt ?? null,
  };
}

// GET /api/events — 행사 목록 (공유 보드: 모든 활성 유저 조회)
export async function GET() {
  const { error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const list = await Event.find({ deletedAt: null })
    .populate("teamIds", "name color")
    .populate("managerId", "name")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  return json({ events: list.map(serializeSummary) });
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
    items: [],
    createdBy: user.id,
  });
  await logActivity({ actorId: user.id, actorName: user.name, action: "create", targetType: "event", targetTitle: created.title });
  // 행사 담당자로 지정된 사람에게 알림 (본인 제외)
  if (created.managerId && String(created.managerId) !== user.id) {
    await notify([String(created.managerId)], {
      type: "event_assigned",
      title: "행사 담당자로 지정됐어요",
      body: created.title,
      link: `/events/${String(created._id)}`,
    });
  }
  return json({ id: String(created._id) }, 201);
}
