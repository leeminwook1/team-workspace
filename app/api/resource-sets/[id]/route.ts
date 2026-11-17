import { connectDB } from "@/lib/mongodb";
import { ResourceSet } from "@/models/ResourceSet";
import { requireActiveUser, json, badId } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";
import { touchChanged } from "@/lib/changes";
import { parseSetBody } from "@/lib/resourceSets";

// PATCH·DELETE /api/resource-sets/:id — 세트 수정·삭제 (시스템 관리자)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "세트를 수정할 권한이 없습니다." }, 403);
  const p = parseSetBody(await req.json().catch(() => null));
  if ("error" in p) return json({ error: p.error }, 400);
  await connectDB();
  const r = await ResourceSet.updateOne({ _id: params.id }, { $set: p });
  if (r.matchedCount === 0) return json({ error: "세트를 찾을 수 없습니다." }, 404);
  await touchChanged("resource");
  return json({ id: params.id });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "세트를 삭제할 권한이 없습니다." }, 403);
  await connectDB();
  await ResourceSet.deleteOne({ _id: params.id });
  await touchChanged("resource");
  return json({ deleted: true });
}
