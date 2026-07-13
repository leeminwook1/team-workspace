"use client";
import { ModalClose } from "@/components/ModalClose";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmProvider";
import { ColorPicker } from "@/components/admin/ColorPicker";

type Cat = { id: string; name: string; color: string; isActive: boolean };
type TeamOpt = { id: string; name: string; color: string };
type Member = { id: string; name: string };
type ResourceRow = {
  id: string; name: string; category: { id: string; name: string } | null;
  ownerTeam: TeamOpt | null; manager: Member | null; // 관리 팀 · 담당자
  isActive: boolean;
};

// 팀별 활성 멤버 로드 (담당자 선택용)
async function fetchMembers(teamId: string): Promise<Member[]> {
  if (!teamId) return [];
  const res = await fetch(`/api/users?team=${teamId}`).catch(() => null);
  if (!res?.ok) return [];
  const d = await res.json();
  return (d.users ?? []).map((u: any) => ({ id: u.id, name: u.name }));
}

export default function ResourceManager({
  initialResources, initialCategories, teams,
}: {
  initialResources: ResourceRow[]; initialCategories: Cat[]; teams: TeamOpt[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: "", categoryId: initialCategories[0]?.id ?? "", ownerTeamId: "", managerId: "" });
  const [formMembers, setFormMembers] = useState<Member[]>([]);

  async function onFormTeamChange(teamId: string) {
    setForm((f) => ({ ...f, ownerTeamId: teamId, managerId: "" }));
    setFormMembers(await fetchMembers(teamId));
  }
  const [newCat, setNewCat] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [editCat, setEditCat] = useState<Cat | null>(null);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCat.trim()) return;
    setErr("");
    const res = await fetch("/api/resource-categories", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newCat.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "분류 추가 실패"); return; }
    setNewCat("");
    router.refresh();
  }

  async function removeCategory(c: Cat) {
    const ok = await confirm({ title: "분류 삭제", message: `"${c.name}" 분류를 삭제할까요?`, confirmText: "삭제", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/resource-categories/${c.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "삭제 실패"); return; }
    router.refresh();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    const res = await fetch("/api/resources", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, ownerTeamId: form.ownerTeamId || null, managerId: form.managerId || null }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error ?? "등록 실패"); return; }
    setForm({ ...form, name: "" }); // 팀·담당자는 유지 — 연속 등록 편의
    router.refresh();
  }

  async function remove(r: ResourceRow) {
    const ok = await confirm({
      title: "장비 삭제",
      message: `"${r.name}"을(를) 삭제할까요?\n예정된 예약이 있으면 삭제되지 않습니다.`,
      confirmText: "삭제", danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/resources/${r.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "삭제 실패"); return; }
    router.refresh();
  }

  const uncategorized = initialResources.filter((r) => !r.category);

  // 분류 접기/펼치기 — 기본은 모두 접힘 (개수만 보이게)
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const toggleCat = (id: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div style={{ maxWidth: 720 }}>
      {/* 장비 분류 관리 */}
      <div className="card" style={{ padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>장비 분류</h2>
        <div className="rc-cats">
          {initialCategories.map((c) => {
            const count = initialResources.filter((r) => r.category?.id === c.id).length;
            return (
              <div className="rc-cat" key={c.id}>
                <span className="dot" style={{ background: c.color, width: 10, height: 10 }} />
                <span className="rc-cat-name">{c.name}</span>
                <span className="rc-cat-count">{count}</span>
                <button className="rc-cat-btn" onClick={() => setEditCat(c)} aria-label="수정">수정</button>
                <button className="rc-cat-btn danger" onClick={() => removeCategory(c)} aria-label="삭제">삭제</button>
              </div>
            );
          })}
        </div>
        <form onSubmit={addCategory} className="rc-add">
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="새 분류 (예: 조명)" maxLength={30} />
          <button className="btn btn-line btn-sm" disabled={!newCat.trim()}>+ 분류 추가</button>
        </form>
      </div>

      {/* 새 장비 등록 */}
      <div className="card" style={{ padding: 22, marginTop: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>새 장비 등록</h2>
        <form onSubmit={create}>
          <div className="form-grid-2 wide-first">
            <div className="field">
              <label>이름</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 카메라 3호 (액션캠)" required />
            </div>
            <div className="field">
              <label>분류</label>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                {initialCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>관리 팀 (선택)</label>
              <select value={form.ownerTeamId} onChange={(e) => onFormTeamChange(e.target.value)}>
                <option value="">공용 (팀 없음)</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>담당자 (선택)</label>
              <select
                value={form.managerId}
                onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                disabled={!form.ownerTeamId}
              >
                <option value="">{form.ownerTeamId ? "없음" : "관리 팀을 먼저 선택"}</option>
                {formMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          {err && <p className="err-msg">{err}</p>}
          <button className="btn btn-primary" disabled={loading || initialCategories.length === 0}>{loading ? "등록 중…" : "등록"}</button>
        </form>
      </div>

      {/* 분류별 장비 목록 */}
      <div className="admin-section-title">장비 {initialResources.length}개</div>
      {initialCategories.map((c) => {
        const items = initialResources.filter((r) => r.category?.id === c.id);
        const open = openCats.has(c.id);
        return (
          <section key={c.id} className="rc-group">
            <button type="button" className="rc-group-head rc-group-toggle" onClick={() => toggleCat(c.id)} aria-expanded={open}>
              <span className={`rsv-caret${open ? " open" : ""}`} aria-hidden>▸</span>
              <span className="dot" style={{ background: c.color, width: 9, height: 9 }} />
              <span>{c.name}</span><span className="kb-count">{items.length}</span>
            </button>
            {!open ? null : items.length === 0 ? (
              <div className="rc-group-empty">이 분류에 등록된 장비가 없습니다.</div>
            ) : (
              <div className="admin-list">
                {items.map((r) => (
                  <div className={`admin-item${r.isActive ? "" : " off"}`} key={r.id}>
                    <div className="admin-item-main">
                      <span className="admin-item-title">{r.name}</span>
                      {r.ownerTeam && (
                        <span className="rc-owner">
                          <span className="dot" style={{ background: r.ownerTeam.color }} />
                          {r.ownerTeam.name}{r.manager ? ` · ${r.manager.name}` : ""}
                        </span>
                      )}
                      {!r.isActive && <span className="status-pill pill-off">비활성</span>}
                    </div>
                    <div className="admin-item-actions">
                      <button className="btn btn-line btn-sm" onClick={() => setEditing(r)}>수정</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* 미분류 (분류가 삭제됐거나 매칭 안 된 장비) */}
      {uncategorized.length > 0 && (
        <section className="rc-group">
          <div className="rc-group-head"><span>미분류</span><span className="kb-count">{uncategorized.length}</span></div>
          <div className="admin-list">
            {uncategorized.map((r) => (
              <div className="admin-item" key={r.id}>
                <div className="admin-item-main"><span className="admin-item-title">{r.name}</span></div>
                <div className="admin-item-actions">
                  <button className="btn btn-line btn-sm" onClick={() => setEditing(r)}>수정</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {editing && <EditModal res={editing} categories={initialCategories} teams={teams} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
      {editCat && <CategoryEditModal cat={editCat} onClose={() => setEditCat(null)} onSaved={() => { setEditCat(null); router.refresh(); }} />}
    </div>
  );
}

function EditModal({
  res, categories, teams, onClose, onSaved,
}: {
  res: ResourceRow; categories: Cat[]; teams: TeamOpt[]; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(res.name);
  const [categoryId, setCategoryId] = useState(res.category?.id ?? categories[0]?.id ?? "");
  const [ownerTeamId, setOwnerTeamId] = useState(res.ownerTeam?.id ?? "");
  const [managerId, setManagerId] = useState(res.manager?.id ?? "");
  const [members, setMembers] = useState<Member[]>([]);
  const [active, setActive] = useState(res.isActive);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // 관리 팀의 멤버 목록 로드 (초기 팀 포함)
  useEffect(() => {
    if (!ownerTeamId) { setMembers([]); return; }
    let alive = true;
    fetchMembers(ownerTeamId).then((m) => { if (alive) setMembers(m); });
    return () => { alive = false; };
  }, [ownerTeamId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch(`/api/resources/${res.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, categoryId, ownerTeamId: ownerTeamId || null, managerId: managerId || null, isActive: active }),
    });
    const data = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(data.error ?? "저장 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>장비 수정</h2>
        <form onSubmit={save}>
          <div className="field">
            <label>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>분류</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>관리 팀</label>
              <select value={ownerTeamId} onChange={(e) => { setOwnerTeamId(e.target.value); setManagerId(""); }}>
                <option value="">공용 (팀 없음)</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>담당자</label>
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)} disabled={!ownerTeamId}>
                <option value="">{ownerTeamId ? "없음" : "관리 팀을 먼저 선택"}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
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
            <button className="btn btn-primary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CategoryEditModal({ cat, onClose, onSaved }: { cat: Cat; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(cat.name);
  const [color, setColor] = useState(cat.color);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch(`/api/resource-categories/${cat.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, color }),
    });
    const data = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(data.error ?? "저장 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>분류 수정</h2>
        <form onSubmit={save}>
          <div className="field">
            <label>분류 이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required autoFocus />
          </div>
          <div className="field">
            <label>구분색</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
