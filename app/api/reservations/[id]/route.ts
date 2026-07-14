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
  // 예약/반납 완료 건 모두 삭제 가능 (이미 취소된 건만 제외)
  if (!r || r.status === "cancelled") return json({ error: "예약을 찾을 수 없습니다." }, 404);

  // 본인이 올린 예약이면 삭제 가능, 최고관리자는 전체 삭제 가능
  if (String(r.reservedBy) !== user.id && user.role !== "admin") {
    return json({ error: "본인이 등록한 예약 또는 최고관리자만 삭제할 수 있습니다." }, 403);
  }

  const wasReturned = r.status === "returned";
  r.status = "cancelled";
  await r.save();
  const res: any = await Resource.findById(r.resourceId).select("name").lean();
  await logActivity({
    actorId: user.id, actorName: user.name, action: "delete", targetType: "reservation",
    targetTitle: reservationLabel(res?.name ?? "자원", r.startAt, r.endAt),
    meta: { detail: wasReturned ? "예약 삭제(반납 완료 건)" : "예약 삭제" },
  });
  return json({ deleted: true });
}
