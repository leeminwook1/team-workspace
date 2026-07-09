import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canApproveUsers, canManageTeams, type SessionUser } from "@/lib/permissions";
import LogoutButton from "@/components/LogoutButton";
import NavLinks, { type NavItem } from "@/components/NavLinks";

export const dynamic = "force-dynamic";

const ORG_LABEL: Record<string, string> = {
  admin: "최고관리자",
  manager: "과장",
  deputy: "부과장",
  secretary: "서기",
};

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.status !== "active") redirect("/pending");

  const user = session.user as SessionUser & { name: string };
  const showAdmin = canApproveUsers(user) || canManageTeams(user);

  const navItems: NavItem[] = [
    { href: "/calendar", label: "달력", icon: "📅" },
    { href: "/resources", label: "자원 예약", icon: "🎛️" },
    ...(showAdmin ? [{ href: "/admin", label: "관리자", icon: "⚙️" }] : []),
  ];

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="glyph">T</span>
          <span className="word">Team<b>Cal</b></span>
        </div>
        <NavLinks items={navItems} />
        <div className="side-foot">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px 10px", minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap" }}>{user.name}</div>
              <div className="side-user-role" style={{ fontSize: 11.5, color: "var(--ink-faint)", whiteSpace: "nowrap" }}>
                {user.orgRole ? ORG_LABEL[user.orgRole] : "팀원"}
              </div>
            </div>
          </div>
          <LogoutButton small />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
