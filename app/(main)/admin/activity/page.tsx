import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canManageTeams, type SessionUser } from "@/lib/permissions";
import ActivityLogView from "@/components/admin/ActivityLogView";

export const dynamic = "force-dynamic";

export default async function AdminActivityPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canManageTeams(session.user as SessionUser)) redirect("/calendar");

  return <ActivityLogView />;
}
