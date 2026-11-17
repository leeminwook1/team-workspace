import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canApproveUsers, type SessionUser } from "@/lib/permissions";
import ApprovalList from "@/components/admin/ApprovalList";

export const dynamic = "force-dynamic";

export default async function AdminPendingPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canApproveUsers(session.user as SessionUser)) redirect("/calendar");

  return (
    <ApprovalList
      isAdmin={session.user.role === "admin"}
    />
  );
}
