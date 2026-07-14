import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canApproveUsers, canManageTeams, type SessionUser } from "@/lib/permissions";
import AdminTabs from "@/components/admin/AdminTabs";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = session.user as SessionUser;

  const tabs = [
    canApproveUsers(user) && { href: "/admin/pending", label: "가입 승인" },
    canApproveUsers(user) && { href: "/admin/stats", label: "통계" },
    canManageTeams(user) && { href: "/admin/teams", label: "팀 관리" },
    canManageTeams(user) && { href: "/admin/categories", label: "카테고리" },
    canManageTeams(user) && { href: "/admin/resources", label: "자원 관리" },
    canManageTeams(user) && { href: "/admin/users", label: "사용자 관리" },
    canManageTeams(user) && { href: "/admin/telegram", label: "텔레그램" },
    canManageTeams(user) && { href: "/admin/activity", label: "활동 로그" },
  ].filter(Boolean) as { href: string; label: string }[];

  if (tabs.length === 0) redirect("/calendar");

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: "0 0 4px" }}>관리자</h1>
        <p className="page-sub">팀·자원·사용자와 활동 로그를 관리합니다.</p>
      </div>
      <AdminTabs tabs={tabs} />
      <AutoRefresh />
      <div>{children}</div>
    </div>
  );
}
