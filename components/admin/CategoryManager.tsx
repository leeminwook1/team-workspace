"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmProvider";
import { ColorPicker, PRESET_COLORS } from "@/components/admin/ColorPicker";

type CatRow = { id: string; name: string; color: string; isActive: boolean };

export default function CategoryManager({ initial }: { initial: CatRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: "", color: PRESET_COLORS[0] });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CatRow | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await fetch("/api/categories", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error ?? "등록 실패"); return; }
    setForm({ name: "", color: PRESET_COLORS[0] });
    router.refresh();
  }

  async function remove(c: CatRow) {
    const ok = await confirm({
      title: "카테고리 삭제",
      message: `"${c.name}" 카테고리를 삭제할까요?\n이 카테고리를 쓰던 업무는 '분류 없음'이 됩니다.`,
      confirmText: "삭제", danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/categories/${c.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "삭제 실패"); return; }
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>새 카테고리</h2>
        <form onSubmit={create}>
          <div className="field">
            <label>이름</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 회의 · 촬영 · 편집 · 행사" required />
          </div>
          <div className="field">
            <label>색상</label>
            <ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <button className="btn btn-primary" disabled={loading}>{loading ? "등록 중…" : "카테고리 추가"}</button>
        </form>
      </div>

      <div className="admin-section-title">카테고리 {initial.length}개</div>
      <div className="admin-list">
        {initial.map((c) => (
          <div className={`admin-item${c.isActive ? "" : " off"}`} key={c.id}>
            <div className="admin-item-main">
              <span className="dot" style={{ background: c.color, width: 12, height: 12 }} />
              <span className="admin-item-title">{c.name}</span>
              {!c.isActive && <span className="status-pill pill-off">비활성</span>}
            </div>
            <div className="admin-item-actions">
              <button className="btn btn-line btn-sm" onClick={() => setEditing(c)}>수정</button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(c)}>삭제</button>
            </div>
          </div>
        ))}
        {initial.length === 0 && (
          <div className="card" style={{ padding: 30, textAlign: "center", color: "var(--ink-faint)" }}>등록된 카테고리가 없습니다.</div>
        )}
      </div>

      {editing && <EditModal cat={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </div>
  );
}

function EditModal({ cat, onClose, onSaved }: { cat: CatRow; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(cat.name);
  const [color, setColor] = useState(cat.color);
  const [active, setActive] = useState(cat.isActive);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch(`/api/categories/${cat.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color, isActive: active }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>카테고리 수정</h2>
        <form onSubmit={save}>
          <div className="field">
            <label>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>색상</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="field">
            <div className="switch-row">
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-soft)" }}>활성 (달력·업무에서 선택 가능)</span>
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
