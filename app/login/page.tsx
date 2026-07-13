"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// 시안(design-draft.html)의 로그인 히어로 — 팀 색상 레전드는 브랜딩용 정적 표기
const TEAM_LEGEND = [
  { name: "사진", color: "#e8951b" },
  { name: "영상", color: "#f0466e" },
  { name: "디자인", color: "#8b5cf6" },
  { name: "문화예술", color: "#12b3a6" },
  { name: "공연예술", color: "#3182f6" },
  { name: "방송예술", color: "#f97316" },
  { name: "음향", color: "#22c55e" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setErr("이메일 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div className="brand">
          <span className="glyph">T</span>
          <span className="word">Team<b>Cal</b></span>
          <span className="brand-tag">문화과</span>
        </div>
        <div>
          <h1>
            문화과의 모든 일정,
            <br />
            <em>하나의 달력</em>에서.
          </h1>
          <p>
            사진·영상·디자인부터 공연·방송·음향까지 — 문화과 모든 팀의
            일정을 색으로 구분해 한눈에 보고, 날짜를 눌러 바로 등록하세요.
          </p>
          <div className="team-legend">
            {TEAM_LEGEND.map((t) => (
              <span key={t.name} className="chip">
                <span className="dot" style={{ background: t.color }} />
                {t.name}
              </span>
            ))}
          </div>
        </div>
        <div className="hero-foot">문화과 구성원 전용 — 가입 신청 후 승인을 거쳐 이용할 수 있어요.</div>
      </div>

      <div className="login-form-panel">
        <div className="card auth-card">
          <h1>다시 오셨네요</h1>
          <p className="sub">로그인하고 문화과 일정을 확인하세요.</p>
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="email">이메일</label>
              <input
                id="email" type="email" placeholder="you@team.com" autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} required
              />
            </div>
            <div className="field">
              <label htmlFor="password">비밀번호</label>
              <input
                id="password" type="password" placeholder="••••••••" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} required
              />
            </div>
            {err && <p className="err-msg">{err}</p>}
            <button className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? "로그인 중…" : "로그인"}
            </button>
          </form>
          <div className="auth-foot">
            아직 계정이 없나요? <Link href="/register">가입 신청</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
