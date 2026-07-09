import { connectDB } from "@/lib/mongodb";
import { Reservation } from "@/models/Reservation";
import "@/models/Resource";
import "@/models/User";
import "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { canReserve } from "@/lib/permissions";
import { reservationSchema } from "@/lib/validations";

// GET /api/reservations?resource=&from=&to= — 예약 조회 (로그인)
export async function GET(req: Request) {
  const { error } = await requireActiveUser();
  if (error) return error;

  const url = new URL(req.url);
  const resource = url.searchParams.get("resource");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  await connectDB();
  const q: any = { status: "booked" };
  if (resource) q.resourceId = resource;
  if (from && to) {
    q.startAt = { $lt: new Date(to) };
    q.endAt = { $gt: new Date(from) };
  }

  const list = await Reservation.find(q)
    .populate("resourceId", "name")
    .populate("reservedBy", "name")
    .populate("teamId", "name color")
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
    })),
  });
}

// POST /api/reservations — 예약 생성, 겹치면 409 (설계 4.6 충돌 방지 핵심)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

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
  return json({ id: String(r._id) }, 201);
}
