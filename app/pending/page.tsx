import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

// 설계 5.3 — pending 사용자는 이 화면만 접근 가능
export default async function PendingPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.status === "active") redirect("/calendar");

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ textAlign: "center" }}>
        <div className="icon-badge wait"><Icon name="clock" size={30} strokeWidth={1.9} /></div>
        <h1>승인 대기 중</h1>
        <p className="sub">
          {session.user.name}님, 가입 신청이 접수되었습니다.
          <br />
          관리자가 팀과 역할을 배정해 승인하면 이용할 수 있어요.
          <br />
          <span style={{ fontSize: 13, color: "var(--ink-faint)" }}>
            (승인 후 이 페이지를 새로고침하면 자동으로 이동합니다)
          </span>
        </p>
        <LogoutButton />
      </div>
    </div>
  );
}
