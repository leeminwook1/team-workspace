import { connectDB } from "@/lib/mongodb";
import { Event } from "@/models/Event";
import "@/models/Team";
import "@/models/User";
import mongoose from "mongoose";
import { requireActiveUser, json } from "@/lib/api";
import { canManageEvents, canDeleteEvent } from "@/lib/permissions";
import { eventUpdateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";

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
  const prevManager = ev.managerId ? String(ev.managerId) : "";
  if (d.title !== undefined) ev.title = d.title;
  if (d.description !== undefined) ev.description = d.description;
  if (d.teamIds !== undefined) ev.teamIds = d.teamIds;
  if (d.managerId !== undefined) ev.managerId = d.managerId || null;
  if (d.eventDate !== undefined) ev.eventDate = d.eventDate ? new Date(d.eventDate) : null;
  if (d.location !== undefined) ev.location = d.location;
  if (d.priority !== undefined) ev.priority = d.priority;

  // 할 일 담당자가 새로 지정된 사람 수집 (본인 제외) — 저장 후 알림
  const newlyAssigned = new Map<string, string[]>();
  if (d.items !== undefined) {
    const before = new Map((ev.items ?? []).map((it: any) => [String(it._id), it.assigneeId ? String(it.assigneeId) : ""]));
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
    for (const it of d.items) {
      const a = it.assigneeId ? String(it.assigneeId) : "";
      if (!a || a === user.id) continue;
      const prev = it.id ? (before.get(String(it.id)) ?? "") : "";
      if (a !== prev) {
        if (!newlyAssigned.has(a)) newlyAssigned.set(a, []);
        newlyAssigned.get(a)!.push(it.title);
      }
    }
  }

  await ev.save();

  // 알림 — 행사 담당자 변경 + 할 일 담당자 신규 지정
  if (d.managerId !== undefined && ev.managerId && String(ev.managerId) !== prevManager && String(ev.managerId) !== user.id) {
    await notify([String(ev.managerId)], {
      type: "event_assigned", title: "행사 담당자로 지정됐어요", body: ev.title, link: `/events/${String(ev._id)}`,
    });
  }
  for (const [uid, titles] of Array.from(newlyAssigned.entries())) {
    await notify([uid], {
      type: "event_assigned",
      title: "행사 할 일 담당자로 지정됐어요",
      body: `${ev.title} — ${titles.slice(0, 3).join(", ")}${titles.length > 3 ? ` 외 ${titles.length - 3}건` : ""}`,
      link: `/events/${String(ev._id)}`,
    });
  }

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
