import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { Task } from "@/models/Task";
import { Team } from "@/models/Team";
import { canViewAllTeams, ROLE_LABEL, type SessionUser } from "@/lib/permissions";
import TeamBoard, { type MemberStat } from "@/components/team/TeamBoard";

export const dynamic = "force-dynamic";

// KST 기준 오늘 자정 + 7일 뒤 경계
function kstBounds() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const start = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000);
  const week = new Date(start.getTime() + 7 * 24 * 3600_000);
  return { now, start, week };
}

// 팀 현황 — 팀장·부팀장: 자기 팀 / admin·과장·부과장·서기: 팀 선택
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
  const members: any[] = await User.find({ teamId, status: "active" })
    .select("name role").sort({ name: 1 }).lean();

  const { now, start, week } = kstBounds();
  const memberIds = members.map((m) => m._id);
  const tasks: any[] = memberIds.length
    ? await Task.find({
        assignees: { $in: memberIds },
        $or: [
          { status: { $in: ["todo", "in_progress"] } }, // 진행·예정·지연 집계용
          { status: "done", endDate: { $gte: start, $lt: week } }, // 이번 주 완료
        ],
      }).select("assignees status startDate endDate title").lean()
    : [];

  const stats: MemberStat[] = members.map((m) => {
    const mine = tasks.filter((t) => (t.assignees ?? []).some((a: any) => String(a) === String(m._id)));
    const overdueTasks = mine.filter((t) => t.status !== "done" && new Date(t.endDate) < now);
    return {
      id: String(m._id),
      name: m.name,
      roleLabel: ROLE_LABEL[m.role as keyof typeof ROLE_LABEL] ?? "팀원",
      isLeader: m.role === "leader" || m.role === "vice_leader",
      inProgress: mine.filter((t) => t.status === "in_progress").length,
      weekDue: mine.filter((t) => t.status !== "done" && new Date(t.endDate) >= now && new Date(t.endDate) < week).length,
      overdue: overdueTasks.length,
      overdueTitles: overdueTasks.slice(0, 3).map((t) => t.title),
      doneWeek: mine.filter((t) => t.status === "done").length,
    };
  });

  return (
    <TeamBoard
      teamName={team?.name ?? ""}
      teamColor={team?.color ?? "#3182f6"}
      teamId={teamId}
      teams={isOrg ? teams.map((t) => ({ id: String(t._id), name: t.name, color: t.color })) : []}
      stats={stats}
    />
  );
}
