import { connectDB } from "@/lib/mongodb";
import { Resource } from "@/models/Resource";
import { Reservation } from "@/models/Reservation";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";

// PATCH /api/resources/:id — 자원 수정 (이름·카테고리·활성화, Admin)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "자원 수정 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "잘못된 요청입니다." }, 400);

  await connectDB();
  const r: any = await Resource.findById(params.id);
  if (!r) return json({ error: "자원을 찾을 수 없습니다." }, 404);

  if (typeof body.name === "string" && body.name.trim()) r.name = body.name.trim();
  if (typeof body.categoryId === "string" && body.categoryId) r.categoryId = body.categoryId;
  if (typeof body.isActive === "boolean") r.isActive = body.isActive;
  await r.save();

  return json({ id: String(r._id) });
}

// DELETE /api/resources/:id — 자원 완전 삭제 (Admin). 예정된 예약이 있으면 차단.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "자원 삭제 권한이 없습니다." }, 403);

  await connectDB();
  const r: any = await Resource.findById(params.id).lean();
  if (!r) return json({ error: "자원을 찾을 수 없습니다." }, 404);

  const booked = await Reservation.countDocuments({ resourceId: params.id, status: "booked", endAt: { $gt: new Date() } });
  if (booked > 0) {
    return json({ error: `예정된 예약 ${booked}건이 있어 삭제할 수 없습니다. 먼저 비활성화하세요.` }, 409);
  }

  await Resource.deleteOne({ _id: params.id });
  return json({ deleted: true });
}
