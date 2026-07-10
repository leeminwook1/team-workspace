import { connectDB } from "@/lib/mongodb";
import { Event } from "@/models/Event";
import "@/models/Team";
import "@/models/User";
import mongoose from "mongoose";
import { requireActiveUser, json } from "@/lib/api";
import { canManageEvents, canDeleteEvent } from "@/lib/permissions";
import { eventUpdateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";

function serializeFull(e: any) {
  return {
    id: String(e._id),
    title: e.title,
    description: e.description,
    teams: (e.teamIds ?? []).filter(Boolean).map((tm: any) => ({ id: String(tm._id ?? tm), name: tm.name ?? "", color: tm.color ?? "#8b95a1" })),
    manager: e.managerId?.name ? { id: String(e.managerId._id ?? e.managerId), name: e.managerId.name } : null,
    eventDate: e.eventDate,
    location: e.location,
    priority: e.priority,
    createdBy: e.createdBy ? String(e.createdBy._id ?? e.createdBy) : null,
    items: (e.items ?? []).map((it: any) => ({
      id: String(it._id),
      title: it.title,
      status: it.status,
      team: it.teamId?.name ? { id: String(it.teamId._id ?? it.teamId), name: it.teamId.name, color: it.teamId.color ?? "#8b95a1" } : null,
      assignee: it.assigneeId?.name ? { id: String(it.assigneeId._id ?? it.assigneeId), name: it.assigneeId.name } : null,
      dueDate: it.dueDate ?? null,
      note: it.note ?? "",
    })),
    createdAt: e.createdAt,
  };
}

// GET /api/events/:id — 행사 + 투두(items) 상세
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const ev: any = await Event.findById(params.id)
    .populate("teamIds", "name color")
    .populate("managerId", "name")
    .populate("items.assigneeId", "name")
    .populate("items.teamId", "name color")
    .lean();
  if (!ev) return json({ error: "행사를 찾을 수 없습니다." }, 404);
  return json({ event: serializeFull(ev) });
}

// PATCH /api/events/:id — 행사 수정 + 투두(items) 갱신 (편집자 역할)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageEvents(user)) return json({ error: "행사를 수정할 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = eventUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const ev: any = await Event.findById(params.id);
  if (!ev) return json({ error: "행사를 찾을 수 없습니다." }, 404);

  const d = parsed.data;
  if (d.title !== undefined) ev.title = d.title;
  if (d.description !== undefined) ev.description = d.description;
  if (d.teamIds !== undefined) ev.teamIds = d.teamIds;
  if (d.managerId !== undefined) ev.managerId = d.managerId || null;
  if (d.eventDate !== undefined) ev.eventDate = d.eventDate ? new Date(d.eventDate) : null;
  if (d.location !== undefined) ev.location = d.location;
  if (d.priority !== undefined) ev.priority = d.priority;
  if (d.items !== undefined) {
    // 기존 _id는 유지하고, 새 항목만 생성 (id 안정성)
    ev.items = d.items.map((it) => ({
      ...(it.id && mongoose.isValidObjectId(it.id) ? { _id: it.id } : {}),
      title: it.title,
      status: it.status ?? "todo",
      teamId: it.teamId || null,
      assigneeId: it.assigneeId || null,
      dueDate: it.dueDate ? new Date(it.dueDate) : null,
      note: it.note ?? "",
    }));
  }

  await ev.save();

  // 행사 필드 수정만 로그 (투두 이동/편집만 있는 경우는 로그 스팸 방지)
  const keys = Object.keys(d);
  const itemsOnly = keys.length === 1 && keys[0] === "items";
  if (!itemsOnly) {
    await logActivity({ actorId: user.id, actorName: user.name, action: "update", targetType: "event", targetTitle: ev.title });
  }
  return json({ id: String(ev._id) });
}

// DELETE /api/events/:id — admin·과장·부과장 또는 등록자 본인
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const ev: any = await Event.findById(params.id).lean();
  if (!ev) return json({ error: "행사를 찾을 수 없습니다." }, 404);
  if (!canDeleteEvent(user, String(ev.createdBy))) {
    return json({ error: "행사 삭제 권한이 없습니다." }, 403);
  }

  await Event.deleteOne({ _id: params.id });
  await logActivity({ actorId: user.id, actorName: user.name, action: "delete", targetType: "event", targetTitle: ev.title });
  return json({ deleted: true });
}
