import { connectDB } from "@/lib/mongodb";
import { Reservation } from "@/models/Reservation";
import "@/models/Resource";
import "@/models/User";
import "@/models/Team";
import { requireActiveUser, json, limitWrites } from "@/lib/api";
import { canReserve } from "@/lib/permissions";
import { reservationSchema } from "@/lib/validations";
import { postCreateGuard } from "@/lib/taskReservations";
import { logActivity, reservationLabel } from "@/lib/activity";
import { Resource } from "@/models/Resource";

// GET /api/reservations?resource=&from=&to= — 예약 조회 (로그인)
export async function GET(req: Request) {
  const { error } = await requireActiveUser();
  if (error) return error;

  const url = new URL(req.url);
  const resource = url.searchParams.get("resource");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  await connectDB();
  const q: any = { status: { $in: ["booked", "returned"] } }; // 반납 완료도 이력으로 표시
  if (resource) q.resourceId = resource;
  if (from && to) {
    q.startAt = { $lt: new Date(to) };
    q.endAt = { $gt: new Date(from) };
  } else {
    // 기간 미지정 시 전량 반환 방지 — 최근 90일 ~ 180일 뒤 창으로 제한
    q.startAt = { $lt: new Date(Date.now() + 180 * 86400_000) };
    q.endAt = { $gt: new Date(Date.now() - 90 * 86400_000) };
  }

  const list = await Reservation.find(q)
    .populate("resourceId", "name")
    .populate("reservedBy", "name")
    .populate("teamId", "name color")
    .populate("returnedBy", "name")
    .sort({ startAt: 1 })
    .lean();

  return json({
    reservations: list.map((r: any) => ({
      id: String(r._id),
      resource: r.resourceId ? { id: String(r.resourceId._id), name: r.resourceId.name } : null,
      reservedBy: r.reservedBy ? { id: String(r.reservedBy._id), name: r.reservedBy.name } : null,
      team: r.teamId ? { id: String(r.teamId._id), name: r.teamId.name, color: r.teamId.color } : null,
      startAt: r.startAt,
      endAt: r.endAt,
      note: r.note,
      status: r.status,
      returnedAt: r.returnedAt ?? null,
      returnedByName: r.returnedBy?.name ?? null,
      relatedTaskId: r.relatedTaskId ? String(r.relatedTaskId) : null,
    })),
  });
}

// POST /api/reservations — 예약 생성, 겹치면 409 (설계 4.6 충돌 방지 핵심)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const limited = await limitWrites(`reserve:${user.id}`, 30, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = reservationSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const d = parsed.data;
  if (!canReserve(user, d.teamId)) {
    return json({ error: "예약 권한이 없습니다. (팀장·부팀장·과장·부과장)" }, 403);
  }

  const startAt = new Date(d.startAt);
  const endAt = new Date(d.endAt);
  if (endAt <= startAt) return json({ error: "종료 시각이 시작 시각보다 빠릅니다." }, 400);

  await connectDB();
  // 장비 상태 확인 — 수리중/고장 장비는 예약 불가
  const resDoc: any = await Resource.findById(d.resourceId).select("name status isActive").lean();
  if (!resDoc || !resDoc.isActive) return json({ error: "예약할 수 없는 장비입니다." }, 400);
  if (resDoc.status && resDoc.status !== "available") {
    const label = resDoc.status === "maintenance" ? "수리·점검 중" : "고장";
    return json({ error: `${resDoc.name}은(는) 현재 ${label}이라 예약할 수 없어요.` }, 409);
  }
  // [startAt, endAt) 구간 겹침 검사 — 같은 자원의 booked 예약과 겹치면 거절
  const conflict = await Reservation.findOne({
    resourceId: d.resourceId,
    status: "booked",
    startAt: { $lt: endAt },
    endAt: { $gt: startAt },
  })
    .populate("reservedBy", "name")
    .lean();

  if (conflict) {
    const c: any = conflict;
    return json(
      {
        error: `이미 예약된 시간입니다. (${c.reservedBy?.name ?? "?"} — ${new Date(
          c.startAt
        ).toLocaleString("ko-KR")} ~ ${new Date(c.endAt).toLocaleString("ko-KR")})`,
      },
      409
    );
  }

  const r = await Reservation.create({
    resourceId: d.resourceId,
    teamId: d.teamId,
    reservedBy: user.id,
    startAt,
    endAt,
    note: d.note,
  });
  // 동시 요청 이중예약 방어 — 생성 후 재검사, 겹침이 보이면 내 예약을 물린다
  const raced = await postCreateGuard(r);
  if (raced) {
    return json({ error: "같은 시간에 다른 예약이 동시에 접수되었습니다. 예약 현황을 확인하고 다시 시도해주세요." }, 409);
  }
  await logActivity({
    actorId: user.id, actorName: user.name, action: "create", targetType: "reservation",
    targetTitle: reservationLabel(resDoc.name ?? "자원", startAt, endAt),
  });
  return json({ id: String(r._id) }, 201);
}
