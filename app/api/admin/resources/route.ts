import { connectDB } from "@/lib/mongodb";
import { Resource } from "@/models/Resource";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";

// GET /api/admin/resources — 비활성 포함 전체 자원 목록 (관리 화면용, Admin)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);

  await connectDB();
  const resources = await Resource.find().sort({ category: 1, name: 1 }).lean();
  return json({
    resources: resources.map((r: any) => ({
      id: String(r._id),
      name: r.name,
      category: r.category,
      isActive: r.isActive,
    })),
  });
}
