import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canApproveUsers, type SessionUser } from "@/lib/permissions";
import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import ApprovalList from "@/components/admin/ApprovalList";

export const dynamic = "force-dynamic";

export default async function AdminPendingPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canApproveUsers(session.user as SessionUser)) redirect("/calendar");

  await connectDB();
  const teams = await Team.find({ isActive: true }).sort({ createdAt: 1 }).lean();

  return (
    <ApprovalList
      teams={teams.map((t: any) => ({ id: String(t._id), name: t.name, color: t.color }))}
      isAdmin={session.user.orgRole === "admin"}
    />
  );
}
