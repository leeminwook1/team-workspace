import { connectDB } from "@/lib/mongodb";
import { Reservation } from "@/models/Reservation";
import { Resource } from "@/models/Resource";
import { requireActiveUser, json } from "@/lib/api";
import { canMarkReturned } from "@/lib/permissions";
import { logActivity, reservationLabel } from "@/lib/activity";

// POST /api/reservations/:id/return — 반납 처리 (예약자·admin·과장·부과장·장비 관리 담당자)
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const r: any = await Reservation.findById(params.id);
  if (!r) return json({ error: "예약을 찾을 수 없습니다." }, 404);
  if (r.status === "returned") return json({ error: "이미 반납 처리된 예약입니다." }, 409);
  if (r.status !== "booked") return json({ error: "취소된 예약은 반납할 수 없습니다." }, 400);

  const res: any = await Resource.findById(r.resourceId).select("name managerId").lean();
  if (!canMarkReturned(user, String(r.reservedBy), res?.managerId ? String(res.managerId) : null)) {
    return json({ error: "반납 처리 권한이 없습니다. (예약자·관리 담당자·과장단)" }, 403);
  }

  const now = new Date();
  const late = now.getTime() > new Date(r.endAt).getTime() + 10 * 60_000; // 10분 유예 후 지연 판정
  r.status = "returned";
  r.returnedAt = now;
  r.returnedBy = user.id;
  await r.save();

  await logActivity({
    actorId: user.id, actorName: user.name, action: "status", targetType: "reservation",
    targetTitle: reservationLabel(res?.name ?? "자원", r.startAt, r.endAt),
    meta: { detail: late ? "지연 반납" : "반납 완료" },
  });
  return json({ returned: true, late });
}
