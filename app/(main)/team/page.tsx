import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import { canViewAllTeams, type SessionUser } from "@/lib/permissions";
import { LazyTeamBoard as TeamBoard } from "@/components/LazyLoad";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

// 팀 현황 — 팀장·부팀장: 자기 팀 / admin·과장·부과장·서기: 팀 선택. 팀원 개인일정 겹쳐보기.
export default async function TeamPage({ searchParams }: { searchParams: { team?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = session.user as SessionUser & { name: string };

  const isOrg = canViewAllTeams(user);
  const isLead = user.role === "leader" || user.role === "vice_leader";
  if (!isOrg && !isLead) redirect("/home");

  await connectDB();
  const teams: any[] = await Team.find({ isActive: true }).sort({ createdAt: 1 }).lean();

  let teamId: string | null = null;
  if (isOrg) teamId = searchParams.team || (teams[0] ? String(teams[0]._id) : null);
  else teamId = user.teamId;
  if (!teamId) redirect("/home");

  const team = teams.find((t) => String(t._id) === teamId);

  return (
    <>
      <AutoRefresh />
      <TeamBoard
        teamName={team?.name ?? ""}
        teamColor={team?.color ?? "#3182f6"}
        teamId={teamId}
        teams={isOrg ? teams.map((t) => ({ id: String(t._id), name: t.name, color: t.color })) : []}
      />
    </>
  );
}
