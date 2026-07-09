"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmProvider";

type ResourceRow = { id: string; name: string; category: string; isActive: boolean };

const CATEGORIES = [
  { value: "studio", label: "스튜디오" },
  { value: "camera", label: "촬영장비" },
  { value: "venue", label: "공연장" },
  { value: "audio", label: "음향장비" },
  { value: "edit", label: "편집실" },
  { value: "etc", label: "기타" },
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

export default function ResourceManager({ initialResources }: { initialResources: ResourceRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: "", category: "studio" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ResourceRow | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await fetch("/api/resources", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error ?? "등록 실패"); return; }
    setForm({ name: "", category: "studio" });
    router.refresh();
  }

  async function remove(r: ResourceRow) {
    const ok = await confirm({
      title: "자원 삭제",
      message: `"${r.name}"을(를) 삭제할까요?\n예정된 예약이 있으면 삭제되지 않습니다.`,
      confirmText: "삭제", danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/resources/${r.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "삭제 실패"); return; }
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>새 자원 등록</h2>
        <form onSubmit={create}>
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

      <div className="admin-section-title">자원 {initialResources.length}개</div>
      <div className="admin-list">
        {initialResources.map((r) => (
          <div className={`admin-item${r.isActive ? "" : " off"}`} key={r.id}>
            <div className="admin-item-main">
              <span className="admin-item-title">{r.name}</span>
              <span className="admin-item-sub">{CAT_LABEL[r.category] ?? r.category}</span>
              {!r.isActive && <span className="status-pill pill-off">비활성</span>}
            </div>
            <div className="admin-item-actions">
              <button className="btn btn-line btn-sm" onClick={() => setEditing(r)}>수정</button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>삭제</button>
            </div>
          </div>
        ))}
        {initialResources.length === 0 && (
          <div className="card" style={{ padding: 30, textAlign: "center", color: "var(--ink-faint)" }}>등록된 자원이 없습니다.</div>
        )}
      </div>

      {editing && <EditModal res={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </div>
  );
}

function EditModal({ res, onClose, onSaved }: { res: ResourceRow; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(res.name);
  const [category, setCategory] = useState(res.category);
  const [active, setActive] = useState(res.isActive);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch(`/api/resources/${res.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, category, isActive: active }),
    });
    const data = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(data.error ?? "저장 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>자원 수정</h2>
        <form onSubmit={save}>
          <div className="field">
            <label>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>분류</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="field">
            <div className="switch-row">
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-soft)" }}>활성 (예약 가능)</span>
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
