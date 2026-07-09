import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canManageTeams, type SessionUser } from "@/lib/permissions";
import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import TeamManager from "@/components/admin/TeamManager";

export const dynamic = "force-dynamic";

export default async function AdminTeamsPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canManageTeams(session.user as SessionUser)) redirect("/calendar");

  await connectDB();
  const teams = await Team.find().sort({ createdAt: 1 }).lean();

  return (
    <div>
      <h1 className="page-title">팀 관리</h1>
      <TeamManager
        initialTeams={teams.map((t: any) => ({
          id: String(t._id),
          name: t.name,
          slug: t.slug,
          color: t.color,
          isActive: t.isActive,
        }))}
      />
    </div>
  );
}
