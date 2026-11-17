import { connectDB } from "@/lib/mongodb";
import { Event } from "@/models/Event";
import "@/models/Team";
import "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canManageEvents } from "@/lib/permissions";
import { eventCreateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { getDeptId } from "@/lib/dept";

// 목록용 요약 (투두 진행률 포함, items 본문은 제외)
function serializeSummary(e: any, meId: string) {
  const items = e.items ?? [];
  const myPositions = (e.positions ?? []).filter((p: any) => (p.userIds ?? []).some((u: any) => String(u) === meId)).map((p: any) => p.name);
  return {
    id: String(e._id),
    title: e.title,
    stageless: true,
    teams: (e.teamIds ?? []).filter(Boolean).map((tm: any) => ({ id: String(tm._id ?? tm), name: tm.name ?? "", color: tm.color ?? "#8b95a1" })),
    eventDate: e.eventDate,
    location: e.location,
    meetTime: e.meetTime ?? "",
    positionsTotal: (e.positions ?? []).length,
    myPositions,
    itemsTotal: items.length,
    itemsDone: items.filter((it: any) => it.status === "done").length,
    createdAt: e.createdAt,
    closedAt: e.closedAt ?? null,
  };
}

// GET /api/events — 행사 목록 (공유 보드: 모든 활성 유저 조회)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const list = await Event.find({ deletedAt: null })
    .populate("teamIds", "name color")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  return json({ events: list.map((e) => serializeSummary(e, user.id)) });
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
  const deptId = await getDeptId(); // 사진과 전용 — 참여 팀은 항상 과
  const created = await Event.create({
    title: d.title,
    description: d.description,
    teamIds: deptId ? [deptId] : [],
    eventDate: d.eventDate ? new Date(d.eventDate) : null,
    location: d.location,
    meetTime: d.meetTime,
    meetPlace: d.meetPlace,
    ...(d.brief ? { brief: d.brief } : {}),
    items: [],
    createdBy: user.id,
  });
  await logActivity({ actorId: user.id, actorName: user.name, action: "create", targetType: "event", targetTitle: created.title });
  return json({ id: String(created._id) }, 201);
}
