import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import type { SessionUser } from "@/lib/permissions";
import AssignmentBoard from "@/components/assignments/AssignmentBoard";

export const dynamic = "force-dynamic";

// 과제 — 팀장이 레퍼런스+컨셉으로 출제, 팀원이 촬영해 제출, 모일 때 함께 점검
export default async function AssignmentsPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as SessionUser; // (main) 레이아웃에서 인증 보장

  // 출제 가능한 팀 — admin: 전체 / 팀장·부팀장: 소속 팀
  await connectDB();
  let manageTeams: { id: string; name: string; color: string }[] = [];
  if (user.role === "admin") {
    const teams: any[] = await Team.find({ isActive: true }).sort({ createdAt: 1 }).lean();
    manageTeams = teams.map((t) => ({ id: String(t._id), name: t.name, color: t.color }));
  } else if ((user.role === "leader" || user.role === "vice_leader") && user.teamId) {
    const t: any = await Team.findById(user.teamId).lean();
    if (t) manageTeams = [{ id: String(t._id), name: t.name, color: t.color }];
  }

  return <AssignmentBoard manageTeams={manageTeams} />;
}
