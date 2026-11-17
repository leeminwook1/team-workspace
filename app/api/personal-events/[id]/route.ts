import { connectDB } from "@/lib/mongodb";
import { PersonalEvent } from "@/models/PersonalEvent";
import { requireActiveUser, json, badId } from "@/lib/api";
import { personalEventSchema } from "@/lib/validations";
import { touchChanged } from "@/lib/changes";

// 개인 일정 수정·삭제 — 소유자 본인만 (과장·admin도 열람만 가능, 수정 불가)
// 반복 일정은 ?scope=one(기본)|following(이 회차 이후)|all(전체)

function seriesScope(req: Request) {
  const s = new URL(req.url).searchParams.get("scope");
  return s === "following" || s === "all" ? s : "one";
}

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

  const oldStart = new Date(e.startDate);
  if (d.title !== undefined) e.title = d.title;
  if (d.memo !== undefined) e.memo = d.memo;
  if (d.location !== undefined) e.location = d.location;
  if (d.startDate !== undefined) e.startDate = new Date(d.startDate);
  if (d.endDate !== undefined) e.endDate = new Date(d.endDate);
  if (d.allDay !== undefined) e.allDay = d.allDay;
  if (isNaN(e.startDate.getTime()) || isNaN(e.endDate.getTime())) return json({ error: "날짜 형식이 잘못됐습니다." }, 400);
  if (e.endDate < e.startDate) return json({ error: "종료가 시작보다 빠를 수 없습니다." }, 400);
  await e.save();

  // 반복 시리즈 일괄 수정 — 제목·장소·메모·종일 여부를 함께 바꾸고, 시각은 이 회차가 이동한 만큼 밀어준다(날짜는 회차별 유지)
  const scope = seriesScope(req);
  let updated = 1;
  if (scope !== "one" && e.recurrenceId) {
    const sq: any = { recurrenceId: e.recurrenceId, userId: e.userId, _id: { $ne: e._id } };
    if (scope === "following") sq.startDate = { $gt: oldStart };
    const meta: any = {};
    if (d.title !== undefined) meta.title = e.title;
    if (d.memo !== undefined) meta.memo = e.memo;
    if (d.location !== undefined) meta.location = e.location;
    if (d.allDay !== undefined) meta.allDay = e.allDay;
    const timeChanged = d.startDate !== undefined || d.endDate !== undefined || d.allDay !== undefined;
    const startDelta = e.startDate.getTime() - oldStart.getTime();
    const duration = e.endDate.getTime() - e.startDate.getTime();
    const siblings: any[] = await PersonalEvent.find(sq).select("_id startDate").lean();
    for (const sb of siblings) {
      const set: any = { ...meta };
      if (timeChanged) {
        const ns = new Date(new Date(sb.startDate).getTime() + startDelta);
        set.startDate = ns;
        set.endDate = new Date(ns.getTime() + duration);
      }
      if (Object.keys(set).length > 0) await PersonalEvent.updateOne({ _id: sb._id }, { $set: set });
    }
    updated += siblings.length;
  }

  await touchChanged("personal");
  return json({ id: String(e._id), updated });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const e: any = await PersonalEvent.findById(params.id).lean();
  if (!e) return json({ error: "일정을 찾을 수 없습니다." }, 404);
  if (String(e.userId) !== user.id) return json({ error: "본인의 개인 일정만 삭제할 수 있습니다." }, 403);

  const scope = seriesScope(req);
  let deleted = 1;
  if (scope !== "one" && e.recurrenceId) {
    const q: any = { recurrenceId: e.recurrenceId, userId: e.userId };
    if (scope === "following") q.startDate = { $gte: e.startDate };
    deleted = (await PersonalEvent.deleteMany(q)).deletedCount ?? 0;
  } else {
    await PersonalEvent.deleteOne({ _id: params.id });
  }
  await touchChanged("personal");
  return json({ deleted });
}
