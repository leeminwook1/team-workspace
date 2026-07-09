"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CatRow = { id: string; name: string; color: string; isActive: boolean };

const PRESET_COLORS = ["#3182f6", "#f0466e", "#8b5cf6", "#12b3a6", "#e8951b", "#f97316", "#22c55e", "#64748b"];

export default function CategoryManager({ initial }: { initial: CatRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", color: PRESET_COLORS[0] });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error ?? "등록 실패"); return; }
    setForm({ name: "", color: PRESET_COLORS[0] });
    router.refresh();
  }

  async function toggleActive(c: CatRow) {
    setBusyId(c.id);
    const res = await fetch(`/api/categories/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    setBusyId("");
    if (!res.ok) { const d = await res.json(); setErr(d.error ?? "변경 실패"); return; }
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 640 }}>
      <div className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>새 카테고리</h2>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>이름</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 회의 · 촬영 · 편집 · 행사" required />
          </div>
          <div className="field">
            <label>색상</label>
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
          <button className="btn btn-primary" disabled={loading}>{loading ? "등록 중…" : "카테고리 추가"}</button>
        </form>
      </div>

      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>카테고리</th><th>상태</th><th style={{ width: 100 }} /></tr></thead>
          <tbody>
            {initial.map((c) => (
              <tr key={c.id} style={{ opacity: c.isActive ? 1 : 0.5 }}>
                <td>
                  <span className="chip"><span className="dot" style={{ background: c.color }} />{c.name}</span>
                </td>
                <td data-label="상태">
                  <span className={`status-pill ${c.isActive ? "pill-on" : "pill-off"}`}>{c.isActive ? "활성" : "비활성"}</span>
                </td>
                <td className="td-actions">
                  <button className={`btn btn-sm ${c.isActive ? "btn-danger" : "btn-ghost"}`} disabled={busyId === c.id} onClick={() => toggleActive(c)}>
                    {c.isActive ? "비활성화" : "다시 활성화"}
                  </button>
                </td>
              </tr>
            ))}
            {initial.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--ink-faint)", padding: 24 }}>등록된 카테고리가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
