import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import { json } from "@/lib/api";

// GET /api/register/teams — 가입 신청 폼용 활성 팀 목록 (비로그인 접근 허용, 이름·색상만 노출)
export async function GET() {
  await connectDB();
  const teams = await Team.find({ isActive: true }).select("name color").sort({ createdAt: 1 }).lean();
  return json({
    teams: teams.map((t: any) => ({ id: String(t._id), name: t.name, color: t.color })),
  });
}
