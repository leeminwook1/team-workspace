import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canViewAllTeams, inTeam } from "@/lib/permissions";

// GET /api/users?team= — 특정 팀의 활성 팀원 (담당자 지정용)
// GET /api/users        — 전체 활성 사용자 (행사 담당자 등, 팀 무관 지정용)
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const team = new URL(req.url).searchParams.get("team");
  await connectDB();

  if (team) {
    // 그 팀을 볼 수 있는 사람만 (전사 역할 또는 그 팀 소속)
    if (!canViewAllTeams(user) && !inTeam(user, team)) {
      return json({ error: "이 팀을 조회할 권한이 없습니다." }, 403);
    }
    const users = await User.find({ status: "active", teamId: team }).select("name role").sort({ name: 1 }).lean();
    return json({ users: users.map((u: any) => ({ id: String(u._id), name: u.name, role: u.role })) });
  }

  // 전체 활성 사용자 (이름 목록 — 담당자 선택용)
  const users = await User.find({ status: "active" }).select("name role").sort({ name: 1 }).lean();
  return json({ users: users.map((u: any) => ({ id: String(u._id), name: u.name, role: u.role })) });
}
