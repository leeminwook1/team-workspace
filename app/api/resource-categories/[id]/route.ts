import { connectDB } from "@/lib/mongodb";
import { ResourceCategory } from "@/models/ResourceCategory";
import { Resource } from "@/models/Resource";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";

// PATCH /api/resource-categories/:id — 이름·활성 수정 (Admin)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "잘못된 요청입니다." }, 400);

  await connectDB();
  const c: any = await ResourceCategory.findById(params.id);
  if (!c) return json({ error: "분류를 찾을 수 없습니다." }, 404);

  if (typeof body.name === "string" && body.name.trim()) c.name = body.name.trim();
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) c.color = body.color;
  if (typeof body.isActive === "boolean") c.isActive = body.isActive;
  try {
    await c.save();
  } catch (e: any) {
    if (e?.code === 11000) return json({ error: "이미 있는 분류 이름입니다." }, 409);
    throw e;
  }
  return json({ id: String(c._id) });
}

// DELETE /api/resource-categories/:id — 분류 삭제 (Admin). 소속 장비가 있으면 차단.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);

  await connectDB();
  const c: any = await ResourceCategory.findById(params.id).lean();
  if (!c) return json({ error: "분류를 찾을 수 없습니다." }, 404);

  const inUse = await Resource.countDocuments({ categoryId: params.id });
  if (inUse > 0) {
    return json({ error: `이 분류에 장비 ${inUse}개가 있어 삭제할 수 없습니다. 먼저 장비를 다른 분류로 옮기세요.` }, 409);
  }

  await ResourceCategory.deleteOne({ _id: params.id });
  return json({ deleted: true });
}
