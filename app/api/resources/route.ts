import { connectDB } from "@/lib/mongodb";
import { Resource } from "@/models/Resource";
import "@/models/ResourceCategory";
import "@/models/Team";
import "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";
import { resourceSchema } from "@/lib/validations";
import { ensureResourceCategories } from "@/lib/resourceCategories";

// GET /api/resources — 자원·장비 목록 (로그인)
export async function GET() {
  const { error } = await requireActiveUser();
  if (error) return error;

  await ensureResourceCategories();
  const resources = await Resource.find({ isActive: true })
    .populate("categoryId", "name color order")
    .populate("ownerTeamId", "name color")
    .populate("managerId", "name")
    .sort({ name: 1 })
    .lean();
  return json({
    resources: resources.map((r: any) => ({
      id: String(r._id),
      name: r.name,
      category: r.categoryId?.name
        ? { id: String(r.categoryId._id ?? r.categoryId), name: r.categoryId.name, color: r.categoryId.color || "#8b95a1", order: r.categoryId.order ?? 0 }
        : null,
      ownerTeam: r.ownerTeamId?.name ? { id: String(r.ownerTeamId._id), name: r.ownerTeamId.name, color: r.ownerTeamId.color } : null,
      manager: r.managerId?.name ? { id: String(r.managerId._id), name: r.managerId.name } : null,
    })),
  });
}

// POST /api/resources — 자원 등록 (Admin)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "자원 등록 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = resourceSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const d = parsed.data;
  // 담당자는 관리 팀이 있어야 의미가 있음 — 팀 없이 담당자만 오면 무시
  const r = await Resource.create({ ...d, managerId: d.ownerTeamId ? d.managerId : null });
  return json({ id: String(r._id) }, 201);
}
