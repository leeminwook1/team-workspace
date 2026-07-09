"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ResourceRow = { id: string; name: string; category: string; isActive: boolean };

const CATEGORIES = [
  { value: "studio", label: "🎬 스튜디오" },
  { value: "camera", label: "📷 촬영장비" },
  { value: "venue", label: "🎭 공연장" },
  { value: "audio", label: "🎙️ 음향장비" },
  { value: "edit", label: "🖥️ 편집실" },
  { value: "etc", label: "📦 기타" },
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

export default function ResourceManager({ initialResources }: { initialResources: ResourceRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", category: "studio" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await fetch("/api/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error ?? "등록 실패"); return; }
    setForm({ name: "", category: "studio" });
    router.refresh();
  }

  async function toggleActive(r: ResourceRow) {
    setBusyId(r.id);
    const res = await fetch(`/api/resources/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !r.isActive }),
    });
    setBusyId("");
    if (!res.ok) { const d = await res.json(); setErr(d.error ?? "변경 실패"); return; }
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 720 }}>
      <div className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>새 자원 등록</h2>
        <form onSubmit={onSubmit}>
          <div className="form-grid-2 wide-first">
            <div className="field">
              <label>이름</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 스튜디오 C" required />
            </div>
            <div className="field">
              <label>분류</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          {err && <p className="err-msg">{err}</p>}
          <button className="btn btn-primary" disabled={loading}>{loading ? "등록 중…" : "등록"}</button>
        </form>
      </div>

      <div className="card" style={{ padding: 8, overflowX: "auto" }}>
        <table className="table">
          <thead><tr><th>이름</th><th>분류</th><th>상태</th><th style={{ width: 100 }} /></tr></thead>
          <tbody>
            {initialResources.map((r) => (
              <tr key={r.id} style={{ opacity: r.isActive ? 1 : 0.5 }}>
                <td style={{ fontWeight: 700 }}>{r.name}</td>
                <td style={{ color: "var(--ink-soft)" }}>{CAT_LABEL[r.category] ?? r.category}</td>
                <td>
                  <span className={`status-pill ${r.isActive ? "pill-on" : "pill-off"}`}>
                    {r.isActive ? "활성" : "비활성"}
                  </span>
                </td>
                <td>
                  <button
                    className={`btn btn-sm ${r.isActive ? "btn-danger" : "btn-ghost"}`}
                    disabled={busyId === r.id}
                    onClick={() => toggleActive(r)}
                  >
                    {r.isActive ? "비활성화" : "다시 활성화"}
                  </button>
                </td>
              </tr>
            ))}
            {initialResources.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-faint)", padding: 24 }}>등록된 자원이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
