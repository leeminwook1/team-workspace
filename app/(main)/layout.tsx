import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { connectDB } from "@/lib/mongodb";
import { Directive } from "@/models/Directive";
import { Notice } from "@/models/Notice";
import { canApproveUsers, canCreateDirective, canManageTeams, canUseDirectives, canViewAllTeams, ROLE_LABEL, type SessionUser } from "@/lib/permissions";
import LogoutButton from "@/components/LogoutButton";
import NavLinks, { BottomNav, type NavItem } from "@/components/NavLinks";
import ThemeToggle from "@/components/ThemeToggle";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationBell from "@/components/NotificationBell";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

// 대기 중(TODO 상태) 지시 개수 — 사이드바 뱃지용. 실패해도 화면을 막지 않는다.
async function pendingDirectiveCount(user: SessionUser): Promise<number> {
  if (!canUseDirectives(user)) return 0;
  try {
    await connectDB();
    const q: any = { status: "todo" };
    if (!canCreateDirective(user)) {
      if (!user.teamId) return 0;
      q.teamId = user.teamId; // 팀장: 소속 팀 인박스만
    }
    return await Directive.countDocuments(q);
  } catch {
    return 0;
  }
}

// 안 읽은 공지 개수 — 사이드바 뱃지용. 실패해도 화면을 막지 않는다.
async function unreadNoticeCount(userId: string): Promise<number> {
  try {
    await connectDB();
    return await Notice.countDocuments({ readBy: { $ne: userId } });
  } catch {
    return 0;
  }
}

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.status !== "active") redirect("/pending");

  const user = session.user as SessionUser & { name: string };
  const showAdmin = canApproveUsers(user) || canManageTeams(user);
  const [todoBadge, noticeBadge] = await Promise.all([
    pendingDirectiveCount(user),
    unreadNoticeCount(user.id),
  ]);

  const showTeamBoard = canViewAllTeams(user) || user.role === "leader" || user.role === "vice_leader";
  const navItems: NavItem[] = [
    { href: "/home", label: "홈", icon: "home" },
    { href: "/calendar", label: "달력", icon: "calendar" },
    { href: "/personal", label: "내 캘린더", icon: "userLine" },
    ...(showTeamBoard ? [{ href: "/team", label: "팀 현황", icon: "users" as const }] : []),
    { href: "/resources", label: "자원 예약", icon: "resources" },
    { href: "/events", label: "행사 관리", icon: "board" },
    ...(canUseDirectives(user) ? [{ href: "/directives", label: "TODO", icon: "inbox" as const, badge: todoBadge }] : []),
    { href: "/notices", label: "공지사항", icon: "megaphone", badge: noticeBadge },
    { href: "/feedback", label: "피드백", icon: "chat" },
    ...(showAdmin ? [{ href: "/admin", label: "관리자", icon: "admin" as const }] : []),
  ];

  const roleLabel = ROLE_LABEL[user.role] ?? "팀원";

  return (
    <div className="shell">
      {/* ── 데스크톱 사이드바 ── */}
      <aside className="side">
        <div className="side-brand-row">
          <Link href="/home" className="brand" aria-label="홈으로">
            <span className="glyph">C</span>
            <span className="word">C<b>HQ</b></span>
            <span className="brand-tag">문화과</span>
          </Link>
          <div className="side-brand-actions">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </div>
        <GlobalSearch />
        <NavLinks items={navItems} />
        <div className="side-foot">
          <Link href="/help" className="side-help">📖 사용 안내</Link>
          <div className="side-user-row">
            <Link href="/settings" className="side-user" title="내 계정 · 설정">
              <span className="avatar avatar-set" aria-hidden>
                {user.name.slice(0, 1)}
                <span className="avatar-gear"><Icon name="gear" size={9} strokeWidth={2.4} /></span>
              </span>
              <div className="side-user-info">
                <div className="side-user-name">{user.name}</div>
                <div className="side-user-role">{roleLabel}</div>
              </div>
            </Link>
            <LogoutButton small />
          </div>
        </div>
      </aside>

      {/* ── 모바일 상단바 ── */}
      <header className="topbar-m">
        <Link href="/home" className="brand" aria-label="홈으로">
          <span className="glyph">C</span>
          <span className="word">C<b>HQ</b></span>
          <span className="brand-tag">문화과</span>
        </Link>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <GlobalSearch compact />
          <NotificationBell />
          <Link href="/settings" className="avatar avatar-set" aria-label="내 계정 설정" style={{ textDecoration: "none" }}>
            {user.name.slice(0, 1)}
            <span className="avatar-gear" aria-hidden><Icon name="gear" size={9} strokeWidth={2.4} /></span>
          </Link>
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
