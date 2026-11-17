import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getDept } from "@/lib/dept";
import { canViewAllTeams, type SessionUser } from "@/lib/permissions";
import { LazyTeamBoard as TeamBoard } from "@/components/LazyLoad";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

// 과원 현황 — 과장·부과장·부장단·admin. 과원 개인일정 겹쳐보기·부재 관리 (사진과 하나만)
export default async function TeamPage({ searchParams }: { searchParams: { team?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = session.user as SessionUser & { name: string };

  const isOrg = canViewAllTeams(user);
  const isLead = user.role === "leader" || user.role === "vice_leader";
  if (!isOrg && !isLead) redirect("/home");

  void searchParams;
  const dept = await getDept();
  if (!dept) redirect("/home");
  const teamId = dept.id;

  return (
    <>
      <AutoRefresh />
      <TeamBoard
        teamName={dept.name}
        teamColor={dept.color}
        teamId={teamId}
        teams={[]}
      />
    </>
  );
}
