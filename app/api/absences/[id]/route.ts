import { connectDB } from "@/lib/mongodb";
import { Absence } from "@/models/Absence";
import { User } from "@/models/User";
import { requireActiveUser, json, badId } from "@/lib/api";
import { canManageAbsence } from "@/lib/permissions";
import { absenceUpdateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { ABSENCE_LABEL, type AbsenceType } from "@/lib/absenceTypes";

// PATCH /api/absences/:id — 부재 수정 (권한: 등록·삭제와 동일 — 본인·팀장·과장단). 대상은 변경 불가.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = absenceUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
  const d = parsed.data;

  await connectDB();
  const a: any = await Absence.findById(params.id);
  if (!a) return json({ error: "부재를 찾을 수 없습니다." }, 404);

  const target: any = await User.findById(a.userId).select("name teamId").lean();
  const tid = target?.teamId ? String(target.teamId) : a.teamId ? String(a.teamId) : null;
  if (!canManageAbsence(user, { id: String(a.userId), teamId: tid })) {
    return json({ error: "부재 수정 권한이 없습니다. (본인·팀장·과장단)" }, 403);
  }

  // 반차는 하루짜리로 고정
  const isHalf = d.type === "half_am" || d.type === "half_pm";
  const endDate = isHalf ? d.startDate : d.endDate;
  if (endDate < d.startDate) return json({ error: "종료일이 시작일보다 빠를 수 없어요." }, 400);

  // 같은 사람의 다른 부재와 겹치면 거절 (자기 자신 제외)
  const dup = await Absence.findOne({
    _id: { $ne: a._id },
    userId: a.userId,
    startDate: { $lte: new Date(endDate) },
    endDate: { $gte: new Date(d.startDate) },
  }).lean();
  if (dup) return json({ error: "그 기간에 이미 등록된 다른 부재가 있어요." }, 409);

  a.type = d.type;
  a.startDate = new Date(d.startDate);
  a.endDate = new Date(endDate);
  a.note = d.note;
  await a.save();

  await logActivity({
    actorId: user.id, actorName: user.name, action: "update", targetType: "absence",
    targetTitle: `${target?.name ?? "?"} ${ABSENCE_LABEL[d.type]} (${d.startDate}~${endDate})`,
  });
  return json({ id: String(a._id) });
}

// DELETE /api/absences/:id — 부재 삭제 (등록 권한과 동일: 본인·팀장·과장단)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const a: any = await Absence.findById(params.id).lean();
  if (!a) return json({ error: "부재를 찾을 수 없습니다." }, 404);

  const target: any = await User.findById(a.userId).select("name teamId").lean();
  const tid = target?.teamId ? String(target.teamId) : a.teamId ? String(a.teamId) : null;
  if (!canManageAbsence(user, { id: String(a.userId), teamId: tid })) {
    return json({ error: "부재 삭제 권한이 없습니다. (본인·팀장·과장단)" }, 403);
  }

  await Absence.deleteOne({ _id: params.id });
  const ymd = (x: Date) => new Date(x).toISOString().slice(0, 10);
  await logActivity({
    actorId: user.id, actorName: user.name, action: "delete", targetType: "absence",
    targetTitle: `${target?.name ?? "?"} ${ABSENCE_LABEL[a.type as AbsenceType] ?? a.type} (${ymd(a.startDate)}~${ymd(a.endDate)})`,
  });
  return json({ deleted: true });
}
