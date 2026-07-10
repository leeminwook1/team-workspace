import { connectDB } from "@/lib/mongodb";
import { Reservation } from "@/models/Reservation";
import { requireActiveUser, json } from "@/lib/api";
import { logActivity, reservationLabel } from "@/lib/activity";
import { Resource } from "@/models/Resource";

// DELETE /api/reservations/:id — 예약 취소 (본인 또는 Admin)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const r: any = await Reservation.findById(params.id);
  if (!r || r.status !== "booked") return json({ error: "예약을 찾을 수 없습니다." }, 404);

  if (String(r.reservedBy) !== user.id && user.role !== "admin") {
    return json({ error: "본인 예약 또는 최고관리자만 취소할 수 있습니다." }, 403);
  }

  r.status = "cancelled";
  await r.save();
  const res: any = await Resource.findById(r.resourceId).select("name").lean();
  await logActivity({
    actorId: user.id, actorName: user.name, action: "delete", targetType: "reservation",
    targetTitle: reservationLabel(res?.name ?? "자원", r.startAt, r.endAt),
    meta: { detail: "예약 취소" },
  });
  return json({ cancelled: true });
}
