import { connectDB } from "@/lib/mongodb";
import { ResourceSet } from "@/models/ResourceSet";
import "@/models/Resource";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";
import { touchChanged } from "@/lib/changes";
import { parseSetBody } from "@/lib/resourceSets";


// GET /api/resource-sets — 세트 목록 (로그인)
export async function GET() {
  const { error } = await requireActiveUser();
  if (error) return error;
  await connectDB();
  const sets: any[] = await ResourceSet.find().populate("resourceIds", "name isActive status").sort({ order: 1, name: 1 }).lean();
  return json({
    sets: sets.map((s) => ({
      id: String(s._id),
      name: s.name,
      note: s.note ?? "",
      resources: (s.resourceIds ?? []).filter(Boolean).map((r: any) => ({ id: String(r._id), name: r.name, isActive: r.isActive !== false, status: r.status ?? "available" })),
    })),
  });
}

// POST /api/resource-sets — 세트 만들기 (시스템 관리자)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "세트를 만들 권한이 없습니다." }, 403);
  const p = parseSetBody(await req.json().catch(() => null));
  if ("error" in p) return json({ error: p.error }, 400);
  await connectDB();
  const last: any = await ResourceSet.findOne().sort({ order: -1 }).select("order").lean();
  const s = await ResourceSet.create({ ...p, order: (last?.order ?? -1) + 1 });
  await touchChanged("resource");
  return json({ id: String(s._id) }, 201);
}
