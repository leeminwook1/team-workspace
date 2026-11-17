"use client";
import { ModalClose } from "@/components/ModalClose";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ConfirmProvider";
import { ColorPicker } from "@/components/admin/ColorPicker";

type Cat = { id: string; name: string; color: string; isActive: boolean };
type Member = { id: string; name: string };
type ResourceRow = {
  id: string; name: string; category: { id: string; name: string } | null;
  manager: Member | null; // 장비 담당자 (반납 책임·문의처)
  isActive: boolean;
  status: "available" | "maintenance" | "broken"; // 장비 상태 (available 외 예약 불가)
};

const RES_STATUS_LABEL: Record<ResourceRow["status"], string> = {
  available: "사용 가능", maintenance: "수리·점검 중", broken: "고장",
};

export default function ResourceManager({
  initialResources, initialCategories, members,
}: {
  initialResources: ResourceRow[]; initialCategories: Cat[]; members: Member[]; // members: 사진과 소속 (담당자 후보)
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [form, setForm] = useState({ name: "", categoryId: initialCategories[0]?.id ?? "", managerId: "" });
  const [newCat, setNewCat] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [editCat, setEditCat] = useState<Cat | null>(null);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCat.trim()) return;
    setErr("");
    try {
      const res = await fetch("/api/resource-categories", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newCat.trim() }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(data.error ?? "분류 추가 실패"); return; }
      setNewCat("");
      router.refresh();
    } catch {
      setErr("네트워크 오류로 추가하지 못했어요.");
    }
  }

  async function removeCategory(c: Cat) {
    const ok = await confirm({ title: "분류 삭제", message: `"${c.name}" 분류를 삭제할까요?`, confirmText: "삭제", danger: true });
    if (!ok) return;
    try {
      const res = await fetch(`/api/resource-categories/${c.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(data.error ?? "삭제 실패"); return; }
      router.refresh();
    } catch {
      setErr("네트워크 오류로 삭제하지 못했어요.");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const res = await fetch("/api/resources", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, managerId: form.managerId || null }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(data.error ?? "등록 실패"); return; }
      setForm({ ...form, name: "" }); // 팀·담당자는 유지 — 연속 등록 편의
      router.refresh();
    } catch {
      setErr("네트워크 오류로 등록하지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(r: ResourceRow) {
    const ok = await confirm({
      title: "장비 삭제",
      message: `"${r.name}"을(를) 삭제할까요?\n예정된 예약이 있으면 삭제되지 않습니다.`,
      confirmText: "삭제", danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/resources/${r.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(data.error ?? "삭제 실패"); return; }
      router.refresh();
    } catch {
      setErr("네트워크 오류로 삭제하지 못했어요.");
    }
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

      {/* 장비 세트 — 자주 같이 빌리는 묶음 */}
      <SetManager resources={initialResources.filter((r) => r.isActive)} categories={initialCategories} />

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
          <div className="field">
            <label>담당자 (선택) · 반납 책임·문의처</label>
            <select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
              <option value="">없음</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
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
                      {r.manager && <span className="rc-owner">담당 {r.manager.name}</span>}
                      {!r.isActive && <span className="status-pill pill-off">비활성</span>}
                      {r.isActive && r.status !== "available" && (
                        <span className={`status-pill ${r.status === "broken" ? "pill-broken" : "pill-maint"}`}>{RES_STATUS_LABEL[r.status]}</span>
                      )}
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

      {editing && <EditModal res={editing} categories={initialCategories} members={members} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
      {editCat && <CategoryEditModal cat={editCat} onClose={() => setEditCat(null)} onSaved={() => { setEditCat(null); router.refresh(); }} />}
    </div>
  );
}

function EditModal({
  res, categories, members, onClose, onSaved,
}: {
  res: ResourceRow; categories: Cat[]; members: Member[]; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(res.name);
  const [categoryId, setCategoryId] = useState(res.category?.id ?? categories[0]?.id ?? "");
  const [managerId, setManagerId] = useState(res.manager?.id ?? "");
  const [active, setActive] = useState(res.isActive);
  const [status, setStatus] = useState<ResourceRow["status"]>(res.status ?? "available");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch(`/api/resources/${res.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, categoryId, managerId: managerId || null, isActive: active, status }),
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
          <div className="field">
            <label>담당자 · 반납 책임·문의처</label>
            <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">없음</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>장비 상태</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as ResourceRow["status"])}>
              <option value="available">사용 가능</option>
              <option value="maintenance">수리·점검 중 (예약 불가)</option>
              <option value="broken">고장 (예약 불가)</option>
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

/* ── 장비 세트 관리 ── */
type SetRow = { id: string; name: string; note: string; resources: { id: string; name: string; isActive: boolean; status: string }[] };

function SetManager({ resources, categories }: { resources: ResourceRow[]; categories: Cat[] }) {
  const confirm = useConfirm();
  const [sets, setSets] = useState<SetRow[]>([]);
  const [editing, setEditing] = useState<SetRow | "new" | null>(null);
  const [err, setErr] = useState("");

  const load = async () => {
    const res = await fetch("/api/resource-sets").catch(() => null);
    if (res?.ok) setSets((await res.json()).sets ?? []);
  };
  useEffect(() => { load(); }, []);

  async function remove(s: SetRow) {
    const ok = await confirm({ title: "세트 삭제", message: `"${s.name}" 세트를 삭제할까요? 장비와 예약은 그대로예요.`, confirmText: "삭제", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/resource-sets/${s.id}`, { method: "DELETE" });
    if (!res.ok) { setErr("삭제하지 못했어요."); return; }
    load();
  }

  return (
    <div className="card" style={{ padding: 22, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>장비 세트</h2>
        <button className="btn btn-line btn-sm" onClick={() => setEditing("new")}>+ 세트 만들기</button>
      </div>
      <p className="page-sub" style={{ margin: "0 0 12px" }}>자주 같이 빌리는 장비를 묶어두면 예약할 때 세트 하나만 골라도 전부 선택돼요.</p>
      {err && <p className="err-msg">{err}</p>}
      {sets.length === 0 ? (
        <p className="muted-note" style={{ padding: "6px 0" }}>아직 세트가 없어요. 예) 세트 1번 — R6 바디 + 24-70 + 배터리 + SD카드</p>
      ) : (
        <div className="set-list">
          {sets.map((s) => (
            <div className="set-item" key={s.id}>
              <div className="set-item-main">
                <b>{s.name}</b> <span className="kb-count">{s.resources.length}</span>
                <div className="set-item-res">{s.resources.map((r) => r.name).join(" · ")}</div>
                {s.note && <div className="set-item-note">{s.note}</div>}
              </div>
              <div className="admin-item-actions">
                <button className="btn btn-line btn-sm" onClick={() => setEditing(s)}>수정</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(s)}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <SetModal
          set={editing === "new" ? null : editing}
          resources={resources}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function SetModal({ set, resources, categories, onClose, onSaved }: {
  set: SetRow | null; resources: ResourceRow[]; categories: Cat[]; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(set?.name ?? "");
  const [note, setNote] = useState(set?.note ?? "");
  const [picked, setPicked] = useState<string[]>(set?.resources.map((r) => r.id) ?? []);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const filtered = resources.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch(set ? `/api/resource-sets/${set.id}` : "/api/resource-sets", {
      method: set ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, note, resourceIds: picked }),
    });
    const d = await res.json().catch(() => ({} as any));
    setBusy(false);
    if (!res.ok) { setErr(d.error ?? "저장 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>{set ? "세트 수정" : "세트 만들기"}</h2>
        <form onSubmit={save}>
          <div className="form-grid-2">
            <div className="field">
              <label>세트 이름</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 세트 1번" maxLength={40} required />
            </div>
            <div className="field">
              <label>메모 (선택)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 행사 스냅용" maxLength={200} />
            </div>
          </div>
          <div className="field">
            <label>구성 장비 · {picked.length}개 선택</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="장비 이름 검색" style={{ marginBottom: 8 }} />
            <div className="set-pick">
              {categories.map((c) => {
                const items = filtered.filter((r) => r.category?.id === c.id);
                if (items.length === 0) return null;
                return (
                  <div key={c.id}>
                    <div className="equip-group"><span className="dot" style={{ background: c.color }} />{c.name}</div>
                    {items.map((r) => {
                      const on = picked.includes(r.id);
                      return (
                        <button type="button" key={r.id} className={`equip-row${on ? " on" : ""}`} onClick={() => toggle(r.id)}>
                          <span className="equip-check" aria-hidden>{on ? "✓" : ""}</span>{r.name}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
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
