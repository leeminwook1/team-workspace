import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canViewAllTeams, inTeam } from "@/lib/permissions";

// GET /api/users?team= — 특정 팀의 활성 팀원 목록 (담당자 지정용)
// 권한: 그 팀을 볼 수 있는 사람 (전사 역할 또는 그 팀 소속)
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const team = new URL(req.url).searchParams.get("team");
  if (!team) return json({ error: "team 파라미터가 필요합니다." }, 400);
  if (!canViewAllTeams(user) && !inTeam(user, team)) {
    return json({ error: "이 팀을 조회할 권한이 없습니다." }, 403);
  }

  await connectDB();
  const users = await User.find({ status: "active", teamId: team })
    .select("name role")
    .lean();

  return json({
    users: users.map((u: any) => ({ id: String(u._id), name: u.name, role: u.role })),
  });
}
