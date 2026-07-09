import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canApproveUsers, canManageTeams, type SessionUser } from "@/lib/permissions";
import AdminTabs from "@/components/admin/AdminTabs";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = session.user as SessionUser;

  const tabs = [
    canApproveUsers(user) && { href: "/admin/pending", label: "가입 승인" },
    canManageTeams(user) && { href: "/admin/teams", label: "팀 관리" },
    canManageTeams(user) && { href: "/admin/resources", label: "자원 관리" },
    canManageTeams(user) && { href: "/admin/users", label: "사용자 관리" },
  ].filter(Boolean) as { href: string; label: string }[];

  if (tabs.length === 0) redirect("/calendar");

  return (
    <div>
      <h1 className="page-title">관리자</h1>
      <AdminTabs tabs={tabs} />
      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  );
}
