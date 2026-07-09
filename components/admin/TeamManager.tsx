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
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [busyId, setBusyId] = useState("");

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

  async function toggleActive(t: TeamRow) {
    setBusyId(t.id);
    const res = await fetch(`/api/teams/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    setBusyId("");
    if (!res.ok) { const d = await res.json(); setErr(d.error ?? "변경 실패"); return; }
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "1fr", maxWidth: 720 }}>
      {/* 팀 생성 */}
      <div className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>새 팀 만들기</h2>
        <form onSubmit={onSubmit}>
          <div className="form-grid-2">
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
      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr><th>팀</th><th>slug</th><th>상태</th><th style={{ width: 160 }} /></tr>
          </thead>
          <tbody>
            {initialTeams.map((t) => (
              <tr key={t.id} style={{ opacity: t.isActive ? 1 : 0.5 }}>
                <td>
                  <span className="chip">
                    <span className="dot" style={{ background: t.color }} />
                    {t.name}
                  </span>
                </td>
                <td data-label="slug" style={{ color: "var(--ink-soft)" }}>{t.slug}</td>
                <td data-label="상태">
                  <span className={`status-pill ${t.isActive ? "pill-on" : "pill-off"}`}>
                    {t.isActive ? "활성" : "비활성"}
                  </span>
                </td>
                <td className="td-actions">
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(t)}>수정</button>
                    <button
                      className={`btn btn-sm ${t.isActive ? "btn-danger" : "btn-ghost"}`}
                      disabled={busyId === t.id}
                      onClick={() => toggleActive(t)}
                    >
                      {t.isActive ? "비활성화" : "다시 활성화"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {initialTeams.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-faint)", padding: 24 }}>등록된 팀이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditTeamModal
          team={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function EditTeamModal({
  team, onClose, onSaved,
}: {
  team: TeamRow; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/teams/${team.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: team.slug, color }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{team.name} 수정</h2>
        <form onSubmit={save}>
          <div className="field">
            <label>팀 이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>팀 색상</label>
            <div style={{ display: "flex", gap: 8 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c} type="button" aria-label={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 30, height: 30, borderRadius: 9, background: c, border: 0, cursor: "pointer",
                    outline: color === c ? "3px solid var(--accent-soft)" : "none",
                    boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                  }}
                />
              ))}
            </div>
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
