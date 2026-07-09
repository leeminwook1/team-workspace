import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canApproveUsers, canManageTeams, type SessionUser } from "@/lib/permissions";
import LogoutButton from "@/components/LogoutButton";
import NavLinks, { BottomNav, type NavItem } from "@/components/NavLinks";
import ThemeToggle from "@/components/ThemeToggle";

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
    { href: "/calendar", label: "달력", icon: "calendar" },
    { href: "/resources", label: "자원 예약", icon: "resources" },
    ...(showAdmin ? [{ href: "/admin", label: "관리자", icon: "admin" as const }] : []),
  ];

  const roleLabel = user.orgRole ? ORG_LABEL[user.orgRole] : "팀원";

  return (
    <div className="shell">
      {/* ── 데스크톱 사이드바 ── */}
      <aside className="side">
        <div className="brand">
          <span className="glyph">T</span>
          <span className="word">Team<b>Cal</b></span>
        </div>
        <NavLinks items={navItems} />
        <div className="side-foot">
          <div className="side-user">
            <span className="avatar" aria-hidden>{user.name.slice(0, 1)}</span>
            <div className="side-user-info">
              <div className="side-user-name">{user.name}</div>
              <div className="side-user-role">{roleLabel}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <ThemeToggle />
            <div style={{ flex: 1 }}><LogoutButton small /></div>
          </div>
        </div>
      </aside>

      {/* ── 모바일 상단바 ── */}
      <header className="topbar-m">
        <div className="brand">
          <span className="glyph">T</span>
          <span className="word">Team<b>Cal</b></span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ThemeToggle />
          <LogoutButton small />
        </div>
      </header>

      <main className="main">{children}</main>

      {/* ── 모바일 하단 탭바 ── */}
      <BottomNav items={navItems} />
    </div>
  );
}
