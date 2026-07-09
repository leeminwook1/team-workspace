import { connectDB } from "@/lib/mongodb";
import { Category } from "@/models/Category";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";
import { categorySchema } from "@/lib/validations";

// GET /api/categories — 활성 카테고리 목록 (로그인)
export async function GET() {
  const { error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const cats = await Category.find({ isActive: true }).sort({ createdAt: 1 }).lean();
  return json({
    categories: cats.map((c: any) => ({ id: String(c._id), name: c.name, color: c.color })),
  });
}

// POST /api/categories — 카테고리 생성 (Admin)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "카테고리 등록 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const c = await Category.create({ ...parsed.data, createdBy: user.id });
  return json({ id: String(c._id) }, 201);
}
