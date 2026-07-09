import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canManageTeams, type SessionUser } from "@/lib/permissions";
import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import UserManager from "@/components/admin/UserManager";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canManageTeams(session.user as SessionUser)) redirect("/calendar");

  await connectDB();
  const teams = await Team.find({ isActive: true }).sort({ createdAt: 1 }).lean();

  return (
    <UserManager
      teams={teams.map((t: any) => ({ id: String(t._id), name: t.name, color: t.color }))}
      currentUserId={session.user.id}
    />
  );
}
