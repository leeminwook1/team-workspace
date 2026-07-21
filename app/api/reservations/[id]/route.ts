import { connectDB } from "@/lib/mongodb";
import { Reservation } from "@/models/Reservation";
import { requireActiveUser, json, badId } from "@/lib/api";
import { logActivity, reservationLabel } from "@/lib/activity";
import { canReserve } from "@/lib/permissions";
import { Resource } from "@/models/Resource";
import "@/models/User";

// PATCH /api/reservations/:id — 예약 수정 (본인 또는 Admin) — 기간·팀·메모. 장비는 그대로.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body?.startAt || !body?.endAt) return json({ error: "기간을 입력하세요." }, 400);

  await connectDB();
  const r: any = await Reservation.findById(params.id);
  // 예약(booked) 상태만 수정 가능 — 반납 완료·취소 건은 수정 불가
  if (!r || r.status !== "booked") return json({ error: "수정할 수 없는 예약입니다. (진행 중인 예약만 수정 가능)" }, 404);
  if (String(r.reservedBy) !== user.id && user.role !== "admin") {
    return json({ error: "본인이 등록한 예약 또는 최고관리자만 수정할 수 있습니다." }, 403);
  }

  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) return json({ error: "날짜 형식이 잘못됐습니다." }, 400);
  if (endAt <= startAt) return json({ error: "종료 시각이 시작 시각보다 빠릅니다." }, 400);

  const teamId = body.teamId ? String(body.teamId) : String(r.teamId);
  if (!canReserve(user, teamId)) return json({ error: "그 팀으로 예약할 권한이 없습니다." }, 403);

  // 겹침 검사 — 같은 자원의 다른 booked 예약과 겹치면 거절 (자기 자신 제외)
  const conflict: any = await Reservation.findOne({
    _id: { $ne: r._id },
    resourceId: r.resourceId, status: "booked",
    startAt: { $lt: endAt }, endAt: { $gt: startAt },
  }).populate("reservedBy", "name").lean();
  if (conflict) {
    return json({
      error: `이미 예약된 시간과 겹칩니다. (${conflict.reservedBy?.name ?? "?"} — ${new Date(conflict.startAt).toLocaleString("ko-KR")} ~ ${new Date(conflict.endAt).toLocaleString("ko-KR")})`,
    }, 409);
  }

  r.startAt = startAt;
  r.endAt = endAt;
  r.teamId = teamId;
  if (typeof body.note === "string") r.note = body.note.slice(0, 300); // 생성과 동일하게 300자 상한
  await r.save();

  const res: any = await Resource.findById(r.resourceId).select("name").lean();
  await logActivity({
    actorId: user.id, actorName: user.name, action: "update", targetType: "reservation",
    targetTitle: reservationLabel(res?.name ?? "자원", r.startAt, r.endAt),
    meta: { detail: "예약 수정" },
  });
  return json({ id: String(r._id) });
}

// DELETE /api/reservations/:id — 예약 취소 (본인 또는 Admin)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
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
