import { connectDB } from "@/lib/mongodb";
import { Category } from "@/models/Category";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";

// PATCH /api/categories/:id — 이름·색상·활성 수정 (Admin)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "잘못된 요청입니다." }, 400);

  await connectDB();
  const c: any = await Category.findById(params.id);
  if (!c) return json({ error: "카테고리를 찾을 수 없습니다." }, 404);

  if (typeof body.name === "string" && body.name.trim()) c.name = body.name.trim();
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) c.color = body.color;
  if (typeof body.isActive === "boolean") c.isActive = body.isActive;
  await c.save();

  return json({ id: String(c._id) });
}

// DELETE /api/categories/:id — 비활성화(soft delete), Admin
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);

  await connectDB();
  const c: any = await Category.findById(params.id);
  if (!c) return json({ error: "카테고리를 찾을 수 없습니다." }, 404);
  c.isActive = false;
  await c.save();
  return json({ deactivated: true });
}
