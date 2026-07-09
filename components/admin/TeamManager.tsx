"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TeamRow = { id: string; name: string; slug: string; color: string; isActive: boolean };

const PRESET_COLORS = ["#e8951b", "#f0466e", "#8b5cf6", "#12b3a6", "#3182f6", "#f97316", "#22c55e", "#64748b"];

export default function TeamManager({ initialTeams }: { initialTeams: TeamRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", slug: "", color: PRESET_COLORS[4], description: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error ?? "팀 생성 실패"); return; }
    setForm({ name: "", slug: "", color: PRESET_COLORS[4], description: "" });
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "1fr", maxWidth: 720 }}>
      {/* 팀 생성 */}
      <div className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>새 팀 만들기</h2>
        <form onSubmit={onSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field">
              <label>팀 이름</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 사진" required />
            </div>
            <div className="field">
              <label>slug (영문)</label>
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="예: photo" required pattern="[a-z0-9-]+" />
            </div>
          </div>
          <div className="field">
            <label>팀 색상</label>
            <div style={{ display: "flex", gap: 8 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c} type="button" aria-label={c}
                  onClick={() => setForm({ ...form, color: c })}
                  style={{
                    width: 30, height: 30, borderRadius: 9, background: c, border: 0, cursor: "pointer",
                    outline: form.color === c ? "3px solid var(--accent-soft)" : "none",
                    boxShadow: form.color === c ? `0 0 0 2px ${c}` : "none",
                  }}
                />
              ))}
            </div>
          </div>
          {err && <p className="err-msg">{err}</p>}
          <button className="btn btn-primary" disabled={loading}>{loading ? "생성 중…" : "팀 생성"}</button>
        </form>
      </div>

      {/* 팀 목록 */}
      <div className="card" style={{ padding: 8 }}>
        <table className="table">
          <thead>
            <tr><th>팀</th><th>slug</th><th>상태</th></tr>
          </thead>
          <tbody>
            {initialTeams.map((t) => (
              <tr key={t.id}>
                <td>
                  <span className="chip">
                    <span className="dot" style={{ background: t.color }} />
                    {t.name}
                  </span>
                </td>
                <td style={{ color: "var(--ink-soft)" }}>{t.slug}</td>
                <td>
                  <span className="status-pill" style={{
                    background: t.isActive ? "rgba(21,196,126,.14)" : "var(--paper)",
                    color: t.isActive ? "var(--st-done)" : "var(--ink-faint)",
                  }}>
                    {t.isActive ? "활성" : "비활성"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
