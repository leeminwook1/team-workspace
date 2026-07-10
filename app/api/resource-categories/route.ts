import { connectDB } from "@/lib/mongodb";
import { ResourceCategory } from "@/models/ResourceCategory";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";
import { resourceCategorySchema } from "@/lib/validations";
import { ensureResourceCategories, RC_PALETTE } from "@/lib/resourceCategories";

// GET /api/resource-categories — 장비 분류 목록 (로그인)
export async function GET() {
  const { error } = await requireActiveUser();
  if (error) return error;

  await ensureResourceCategories();
  const cats = await ResourceCategory.find().sort({ order: 1, name: 1 }).lean();
  return json({
    categories: cats.map((c: any) => ({ id: String(c._id), name: c.name, color: c.color || "#8b95a1", order: c.order, isActive: c.isActive })),
  });
}

// POST /api/resource-categories — 분류 추가 (Admin)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "분류 추가 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = resourceCategorySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const last = await ResourceCategory.findOne().sort({ order: -1 }).select("order").lean();
  const order = ((last as any)?.order ?? -1) + 1;
  // 색 미지정 시 팔레트에서 아직 안 쓴 색 → 다 쓰면 순환 배정
  let color = parsed.data.color ?? "";
  if (!color) {
    const used = new Set((await ResourceCategory.find().select("color").lean()).map((c: any) => c.color));
    color = RC_PALETTE.find((p) => !used.has(p)) ?? RC_PALETTE[order % RC_PALETTE.length];
  }
  try {
    const c = await ResourceCategory.create({ name: parsed.data.name.trim(), color, order, createdBy: user.id });
    return json({ id: String(c._id) }, 201);
  } catch (e: any) {
    if (e?.code === 11000) return json({ error: "이미 있는 분류 이름입니다." }, 409);
    throw e;
  }
}
