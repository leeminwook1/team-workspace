import { connectDB } from "@/lib/mongodb";
import { PersonalEvent } from "@/models/PersonalEvent";
import { requireActiveUser, json, badId } from "@/lib/api";
import { personalEventSchema } from "@/lib/validations";
import { touchChanged } from "@/lib/changes";

// 개인 일정 수정·삭제 — 소유자 본인만 (팀장·admin도 열람만 가능, 수정 불가)

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = personalEventSchema.partial().safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
  const d = parsed.data;

  await connectDB();
  const e: any = await PersonalEvent.findById(params.id);
  if (!e) return json({ error: "일정을 찾을 수 없습니다." }, 404);
  if (String(e.userId) !== user.id) return json({ error: "본인의 개인 일정만 수정할 수 있습니다." }, 403);

  if (d.title !== undefined) e.title = d.title;
  if (d.memo !== undefined) e.memo = d.memo;
  if (d.location !== undefined) e.location = d.location;
  if (d.startDate !== undefined) e.startDate = new Date(d.startDate);
  if (d.endDate !== undefined) e.endDate = new Date(d.endDate);
  if (d.allDay !== undefined) e.allDay = d.allDay;
  if (e.endDate < e.startDate) return json({ error: "종료가 시작보다 빠를 수 없습니다." }, 400);

  await e.save();
  await touchChanged("personal");
  return json({ id: String(e._id) });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const e: any = await PersonalEvent.findById(params.id).lean();
  if (!e) return json({ error: "일정을 찾을 수 없습니다." }, 404);
  if (String(e.userId) !== user.id) return json({ error: "본인의 개인 일정만 삭제할 수 있습니다." }, 403);

  await PersonalEvent.deleteOne({ _id: params.id });
  await touchChanged("personal");
  return json({ deleted: true });
}
