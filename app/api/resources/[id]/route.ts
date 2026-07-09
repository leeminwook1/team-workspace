import { connectDB } from "@/lib/mongodb";
import { Resource } from "@/models/Resource";
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
  if (typeof body.category === "string") r.category = body.category;
  if (typeof body.isActive === "boolean") r.isActive = body.isActive;
  await r.save();

  return json({ id: String(r._id) });
}

// DELETE /api/resources/:id — 자원 비활성화(soft delete), Admin
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "자원 삭제 권한이 없습니다." }, 403);

  await connectDB();
  const r: any = await Resource.findById(params.id);
  if (!r) return json({ error: "자원을 찾을 수 없습니다." }, 404);

  r.isActive = false;
  await r.save();
  return json({ deactivated: true });
}
