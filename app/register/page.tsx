"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setErr(data.error ?? "가입 신청에 실패했습니다.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card" style={{ textAlign: "center" }}>
          <div className="icon-badge ok"><Icon name="check" size={30} strokeWidth={2.4} /></div>
          <h1>가입 신청 완료</h1>
          <p className="sub">
            관리자가 팀과 역할을 배정해 승인하면
            <br />
            로그인 후 이용할 수 있습니다.
          </p>
          <Link href="/login" className="btn btn-primary btn-lg">로그인으로</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand" style={{ marginBottom: 22 }}>
          <span className="glyph">T</span>
          <span className="word">Team<b>Cal</b></span>
        </div>
        <h1>가입 신청</h1>
        <p className="sub">신청 후 관리자 승인을 거쳐 이용할 수 있어요.</p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="name">이름</label>
            <input
              id="name" placeholder="홍길동" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required
            />
          </div>
          <div className="field">
            <label htmlFor="email">이메일</label>
            <input
              id="email" type="email" placeholder="you@team.com" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} required
            />
          </div>
          <div className="field">
            <label htmlFor="password">비밀번호 (8자 이상)</label>
            <input
              id="password" type="password" placeholder="••••••••" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8}
            />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <button className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? "신청 중…" : "가입 신청하기"}
          </button>
        </form>
        <div className="auth-foot">
          이미 계정이 있나요? <Link href="/login">로그인</Link>
        </div>
      </div>
    </div>
  );
}
