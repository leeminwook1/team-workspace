"use client";
import { ModalClose } from "@/components/ModalClose";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";
import { Pagination } from "@/components/Pagination";
import { Icon } from "@/components/icons";
import { useAutoRefresh } from "@/components/useAutoRefresh";

const PAGE_SIZE = 10;

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "disabled";
  team: { id: string; name: string; color: string } | null;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "시스템 관리자", manager: "부장", secretary: "서무", deputy: "총교관",
  leader: "과장", vice_leader: "부과장", member: "과원",
};
// 직급 그룹 — 부장단(부장·서무·총교관) / 과(과장·부과장·과원)
const BOARD = ["manager", "secretary", "deputy"];
const ROLE_OPTIONS = [
  { value: "member", label: "과원" },
  { value: "vice_leader", label: "부과장" },
  { value: "leader", label: "과장" },
  { value: "deputy", label: "총교관 (부장단)" },
  { value: "secretary", label: "서무 (부장단)" },
  { value: "manager", label: "부장 (부장단)" },
  { value: "admin", label: "시스템 관리자" },
];
// 직급순 정렬용 서열 (높은 직급 먼저)
const ROLE_RANK: Record<string, number> = {
  manager: 0, secretary: 1, deputy: 2, leader: 3, vice_leader: 4, member: 5, admin: 6,
};
const GROUP_FILTERS = [
  { value: "", label: "전체" },
  { value: "board", label: "부장단" },
  { value: "dept", label: "과장·부과장·과원" },
];

export default function UserManager({ currentUserId }: { currentUserId: string }) {
  const confirm = useConfirm();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState(""); // 이름·이메일 검색
  const [groupFilter, setGroupFilter] = useState(""); // "" 전체 | board 부장단 | dept 과
  const [sort, setSort] = useState<"name" | "role">("role");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers((await res.json()).users ?? []);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, ["user"]); // 자동 반영

  async function remove(u: UserRow) {
    const ok = await confirm({
      title: "사용자 삭제",
      message: `"${u.name}"(${u.email}) 계정을 완전히 삭제할까요?\n되돌릴 수 없습니다.`,
      confirmText: "삭제", danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(data.error ?? "삭제 실패"); return; }
      load();
    } catch {
      setErr("네트워크 오류로 삭제하지 못했어요.");
    }
  }

  // 검색 → 직급 그룹 → 정렬
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = users;
    if (q) list = list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    if (groupFilter === "board") list = list.filter((u) => BOARD.includes(u.role));
    else if (groupFilter === "dept") list = list.filter((u) => ["leader", "vice_leader", "member"].includes(u.role));
    return [...list].sort((a, b) => {
      if (sort === "role") return (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9) || a.name.localeCompare(b.name, "ko");
      return a.name.localeCompare(b.name, "ko");
    });
  }, [users, query, groupFilter, sort]);

  if (!loaded) return <p style={{ color: "var(--ink-faint)" }}>불러오는 중…</p>;

  // 10명씩 페이지네이션 — 필터·삭제로 마지막 페이지가 비면 자동으로 앞 페이지로
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, totalPages);
  const pageUsers = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const filtering = !!query.trim() || !!groupFilter;

  return (
    <div style={{ maxWidth: 720 }}>
      {err && <p className="err-msg">{err}</p>}

      {/* 검색 · 직급 그룹 · 정렬 */}
      <div className="um-toolbar">
        <div className="um-search">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="이름·이메일 검색"
            aria-label="사용자 검색"
          />
          {query && <button type="button" className="um-clear" aria-label="지우기" onClick={() => { setQuery(""); setPage(1); }}>×</button>}
        </div>
        <select value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }} aria-label="직급 그룹">
          {GROUP_FILTERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="정렬">
          <option value="role">직급순</option>
          <option value="name">이름순</option>
        </select>
      </div>

      <div className="admin-section-title">
        사용자 {filtered.length}명{filtering && ` / 전체 ${users.length}명`}
      </div>
      <div className="admin-list">
        {pageUsers.map((u) => (
          <div className={`admin-item${u.status === "active" ? "" : " off"}`} key={u.id}>
            <div className="admin-item-main">
              <span className="avatar avatar-sm" aria-hidden>{u.name.slice(0, 1)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="admin-item-title">
                  {u.name}{u.id === currentUserId && <span style={{ color: "var(--ink-faint)", fontWeight: 500 }}> (나)</span>}
                </div>
                <div className="admin-item-sub">{u.email}</div>
              </div>
              <span className="chip" style={{ marginLeft: 4 }}>{ROLE_LABEL[u.role] ?? u.role}</span>
              {u.status !== "active" && <span className="status-pill pill-off">비활성</span>}
            </div>
            <div className="admin-item-actions">
              <button className="btn btn-line btn-sm" onClick={() => setEditing(u)}>편집</button>
              {u.id !== currentUserId && (
                <button className="btn btn-danger btn-sm" onClick={() => remove(u)}>삭제</button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="card" style={{ padding: 30, textAlign: "center", color: "var(--ink-faint)" }}>
            {filtering ? "조건에 맞는 사용자가 없습니다." : "사용자가 없습니다."}
          </div>
        )}
      </div>
      <Pagination page={cur} totalPages={totalPages} onPage={setPage} />

      {editing && (
        <EditModal
          user={editing}
          isSelf={editing.id === currentUserId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function EditModal({
  user, isSelf, onClose, onSaved,
}: {
  user: UserRow; isSelf: boolean; onClose: () => void; onSaved: () => void;
}) {
  const confirm = useConfirm();
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.status === "active");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function resetPassword() {
    const ok = await confirm({
      title: "임시 비밀번호 발급",
      message: `${user.name} 님의 비밀번호를 임시 비밀번호로 초기화할까요?\n기존 비밀번호는 즉시 사용할 수 없게 됩니다.`,
      confirmText: "발급",
    });
    if (!ok) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: "POST" });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(data.error ?? "발급 실패"); return; }
      setTempPw(data.tempPassword);
      setCopied(false);
    } catch {
      setErr("네트워크 오류로 발급하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function copyTempPw() {
    if (!tempPw) return;
    try { await navigator.clipboard.writeText(tempPw); setCopied(true); } catch { /* http 환경 등 */ }
  }

  async function save() {
    setBusy(true); setErr("");
    const body: any = { role }; // 소속(사진과)은 서버가 직급에 맞춰 채움
    if (!isSelf) body.status = active ? "active" : "disabled";
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
      onSaved();
    } catch {
      setErr("네트워크 오류로 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>{user.name} — 편집</h2>

        <div className="field">
          <label>직급</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {BOARD.includes(role) && (
          <p style={{ fontSize: 12.5, color: "var(--ink-faint)", margin: "0 0 8px" }}>
            부장단은 사진과 전체를 조회하고 TODO를 지시할 수 있어요.
          </p>
        )}

        {!isSelf && (
          <div className="field">
            <div className="switch-row">
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-soft)" }}>계정 활성</span>
              <button type="button" role="switch" aria-checked={active} className={`toggle${active ? " on" : ""}`} onClick={() => setActive(!active)}>
                <span className="toggle-knob" />
              </button>
            </div>
          </div>
        )}

        {/* 임시 비밀번호 발급 — 비밀번호를 잊은 사용자용 */}
        <div className="pw-reset">
          {tempPw ? (
            <div className="pw-reset-result">
              <div className="pw-reset-label">임시 비밀번호가 발급되었습니다. <b>지금 한 번만</b> 표시돼요.</div>
              <div className="pw-reset-row">
                <code className="pw-reset-code">{tempPw}</code>
                <button type="button" className="btn btn-line btn-sm" onClick={copyTempPw}>{copied ? "복사됨 ✓" : "복사"}</button>
              </div>
              <div className="pw-reset-hint">본인에게 전달하고, 로그인 후 <b>내 계정</b>에서 비밀번호를 바꾸도록 안내하세요.</div>
            </div>
          ) : (
            <div className="pw-reset-row between">
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-soft)" }}>비밀번호를 잊었나요?</div>
                <div className="pw-reset-hint">임시 비밀번호를 만들어 본인에게 전달할 수 있어요.</div>
              </div>
              <button type="button" className="btn btn-line btn-sm" disabled={busy} onClick={resetPassword}>임시 비밀번호 발급</button>
            </div>
          )}
        </div>

        {err && <p className="err-msg">{err}</p>}
        <div className="modal-actions">
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
