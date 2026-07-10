"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmProvider";
import { ColorPicker, PRESET_COLORS } from "@/components/admin/ColorPicker";

type TeamRow = { id: string; name: string; slug: string; color: string; isActive: boolean };

export default function TeamManager({ initialTeams }: { initialTeams: TeamRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: "", slug: "", color: PRESET_COLORS[0], description: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await fetch("/api/teams", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error ?? "팀 생성 실패"); return; }
    setForm({ name: "", slug: "", color: PRESET_COLORS[0], description: "" });
    router.refresh();
  }

  async function remove(t: TeamRow) {
    const ok = await confirm({
      title: "팀 삭제",
      message: `"${t.name}" 팀을 삭제할까요?\n소속 인원이나 업무가 있으면 삭제되지 않습니다.`,
      confirmText: "삭제", danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/teams/${t.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "삭제 실패"); return; }
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>새 팀 만들기</h2>
        <form onSubmit={create}>
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
            <ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <button className="btn btn-primary" disabled={loading}>{loading ? "생성 중…" : "팀 생성"}</button>
        </form>
      </div>

      <div className="admin-section-title">팀 {initialTeams.length}개</div>
      <div className="admin-list">
        {initialTeams.map((t) => (
          <div className={`admin-item${t.isActive ? "" : " off"}`} key={t.id}>
            <div className="admin-item-main">
              <span className="dot" style={{ background: t.color, width: 12, height: 12 }} />
              <span className="admin-item-title">{t.name}</span>
              <span className="admin-item-sub">{t.slug}</span>
              {!t.isActive && <span className="status-pill pill-off">비활성</span>}
            </div>
            <div className="admin-item-actions">
              <button className="btn btn-line btn-sm" onClick={() => setEditing(t)}>수정</button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(t)}>삭제</button>
            </div>
          </div>
        ))}
        {initialTeams.length === 0 && (
          <div className="card" style={{ padding: 30, textAlign: "center", color: "var(--ink-faint)" }}>등록된 팀이 없습니다.</div>
        )}
      </div>

      {editing && <EditModal team={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </div>
  );
}

function EditModal({ team, onClose, onSaved }: { team: TeamRow; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color);
  const [active, setActive] = useState(team.isActive);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch(`/api/teams/${team.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: team.slug, color, isActive: active }),
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
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="field">
            <div className="switch-row">
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-soft)" }}>활성</span>
              <button type="button" role="switch" aria-checked={active} className={`toggle${active ? " on" : ""}`} onClick={() => setActive(!active)}>
                <span className="toggle-knob" />
              </button>
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
