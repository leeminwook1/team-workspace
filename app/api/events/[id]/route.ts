import { connectDB } from "@/lib/mongodb";
import { Event } from "@/models/Event";
import { requireActiveUser, json } from "@/lib/api";
import { canManageEvents, canDeleteEvent } from "@/lib/permissions";
import { eventUpdateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";

// PATCH /api/events/:id — 수정·단계 이동·체크리스트 (편집자 역할)
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
  const prevStage = ev.stage;

  if (d.title !== undefined) ev.title = d.title;
  if (d.description !== undefined) ev.description = d.description;
  if (d.stage !== undefined) ev.stage = d.stage;
  if (d.teamIds !== undefined) ev.teamIds = d.teamIds;
  if (d.managerId !== undefined) ev.managerId = d.managerId || null;
  if (d.eventDate !== undefined) ev.eventDate = d.eventDate ? new Date(d.eventDate) : null;
  if (d.location !== undefined) ev.location = d.location;
  if (d.priority !== undefined) ev.priority = d.priority;
  if (d.checklist !== undefined) ev.checklist = d.checklist.map((c) => ({ text: c.text, done: !!c.done }));

  await ev.save();

  // 단계가 바뀌면 status 로그, 그 외엔 update
  const stageChanged = d.stage !== undefined && d.stage !== prevStage;
  await logActivity({
    actorId: user.id,
    actorName: user.name,
    action: stageChanged ? "status" : "update",
    targetType: "event",
    targetTitle: ev.title,
    meta: stageChanged ? { status: ev.stage } : undefined,
  });
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
