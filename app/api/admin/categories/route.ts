import { connectDB } from "@/lib/mongodb";
import { Category } from "@/models/Category";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";

// GET /api/admin/categories — 비활성 포함 전체 (관리 화면, Admin)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);

  await connectDB();
  const cats = await Category.find().sort({ createdAt: 1 }).lean();
  return json({
    categories: cats.map((c: any) => ({ id: String(c._id), name: c.name, color: c.color, isActive: c.isActive })),
  });
}
