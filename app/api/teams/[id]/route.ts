import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";
import { teamSchema } from "@/lib/validations";

// PATCH /api/teams/:id — 팀 수정 (이름·색상·설명·활성화, Admin만)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "팀 수정 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = teamSchema.partial().safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const team: any = await Team.findById(params.id);
  if (!team) return json({ error: "팀을 찾을 수 없습니다." }, 404);

  if (parsed.data.slug && parsed.data.slug !== team.slug) {
    const dup = await Team.findOne({ slug: parsed.data.slug, _id: { $ne: params.id } }).lean();
    if (dup) return json({ error: "이미 존재하는 slug입니다." }, 409);
  }

  Object.assign(team, parsed.data);
  if (typeof body?.isActive === "boolean") team.isActive = body.isActive;
  await team.save();

  return json({ id: String(team._id) });
}
