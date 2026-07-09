import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";
import { teamSchema } from "@/lib/validations";

// GET /api/teams — 팀 목록 (로그인)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const teams = await Team.find({ isActive: true }).sort({ createdAt: 1 }).lean();
  return json({
    teams: teams.map((t: any) => ({
      id: String(t._id),
      name: t.name,
      slug: t.slug,
      color: t.color,
      description: t.description,
    })),
  });
}

// POST /api/teams — 팀 생성 (Admin만, 설계 3.2)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "팀 생성 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = teamSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const dup = await Team.findOne({ slug: parsed.data.slug }).lean();
  if (dup) return json({ error: "이미 존재하는 slug입니다." }, 409);

  const team = await Team.create({ ...parsed.data, createdBy: user.id });
  return json({ id: String(team._id) }, 201);
}
