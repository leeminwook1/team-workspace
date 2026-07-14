import { connectDB } from "@/lib/mongodb";
import { Absence } from "@/models/Absence";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canManageAbsence } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { ABSENCE_LABEL, type AbsenceType } from "@/lib/absenceTypes";

// DELETE /api/absences/:id — 부재 삭제 (등록 권한과 동일: 본인·팀장·과장단)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
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
