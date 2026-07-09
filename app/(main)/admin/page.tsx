import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canApproveUsers, canManageTeams, type SessionUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// /admin — 접근 가능한 첫 번째 관리 화면으로 보냄
export default async function AdminIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = session.user as SessionUser;

  if (canApproveUsers(user)) redirect("/admin/pending");
  if (canManageTeams(user)) redirect("/admin/teams");
  redirect("/calendar");
}
