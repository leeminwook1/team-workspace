import { connectDB } from "@/lib/mongodb";
import { ResourceCategory } from "@/models/ResourceCategory";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";
import { resourceCategorySchema } from "@/lib/validations";
import { ensureResourceCategories } from "@/lib/resourceCategories";

// GET /api/resource-categories — 장비 분류 목록 (로그인)
export async function GET() {
  const { error } = await requireActiveUser();
  if (error) return error;

  await ensureResourceCategories();
  const cats = await ResourceCategory.find().sort({ order: 1, name: 1 }).lean();
  return json({
    categories: cats.map((c: any) => ({ id: String(c._id), name: c.name, order: c.order, isActive: c.isActive })),
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
  try {
    const c = await ResourceCategory.create({ name: parsed.data.name.trim(), order, createdBy: user.id });
    return json({ id: String(c._id) }, 201);
  } catch (e: any) {
    if (e?.code === 11000) return json({ error: "이미 있는 분류 이름입니다." }, 409);
    throw e;
  }
}
