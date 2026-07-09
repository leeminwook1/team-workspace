"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand" style={{ marginBottom: 22 }}>
          <span className="glyph">T</span>
          <span className="word">Team<b>Cal</b></span>
        </div>
        <h1>다시 오셨네요</h1>
        <p className="sub">계정으로 로그인해 팀 일정을 확인하세요.</p>
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
  );
}
