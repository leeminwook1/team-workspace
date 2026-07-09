import { connectDB } from "@/lib/mongodb";
import { Resource } from "@/models/Resource";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";

// GET /api/resources — 자원·장비 목록 (로그인)
export async function GET() {
  const { error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const resources = await Resource.find({ isActive: true }).sort({ category: 1, name: 1 }).lean();
  return json({
    resources: resources.map((r: any) => ({
      id: String(r._id),
      name: r.name,
      category: r.category,
    })),
  });
}

// POST /api/resources — 자원 등록 (Admin)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "자원 등록 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  if (!body?.name) return json({ error: "자원 이름을 입력하세요." }, 400);

  await connectDB();
  const r = await Resource.create({ name: body.name, category: body.category ?? "etc" });
  return json({ id: String(r._id) }, 201);
}
