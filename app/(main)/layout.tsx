import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { canApproveUsers, canManageTeams, type SessionUser } from "@/lib/permissions";
import LogoutButton from "@/components/LogoutButton";

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
  const showApprove = canApproveUsers(user);
  const showTeamAdmin = canManageTeams(user);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="glyph">T</span>
          <span className="word">Team<b>Cal</b></span>
        </div>
        <nav className="nav">
          <Link href="/calendar">📅 달력</Link>
          <Link href="/resources">🎛️ 자원 예약</Link>
          {showApprove && <Link href="/admin/pending">✅ 가입 승인</Link>}
          {showTeamAdmin && <Link href="/admin/teams">👥 팀 관리</Link>}
        </nav>
        <div className="side-foot">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px 10px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{user.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
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
