"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";

type TeamOpt = { id: string; name: string; color: string };
type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "disabled";
  team: { id: string; name: string; color: string } | null;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "최고관리자", manager: "과장", deputy: "부과장", secretary: "서기",
  leader: "팀장", vice_leader: "부팀장", member: "팀원",
};
const TEAM_ROLE_VALUES = ["leader", "vice_leader", "member"];
const isTeamRole = (r: string) => TEAM_ROLE_VALUES.includes(r);
const ROLE_OPTIONS = [
  { value: "member", label: "팀원" },
  { value: "vice_leader", label: "부팀장" },
  { value: "leader", label: "팀장" },
  { value: "secretary", label: "서기" },
  { value: "deputy", label: "부과장" },
  { value: "manager", label: "과장" },
  { value: "admin", label: "최고관리자" },
];

export default function UserManager({ teams, currentUserId }: { teams: TeamOpt[]; currentUserId: string }) {
  const confirm = useConfirm();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers((await res.json()).users ?? []);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(u: UserRow) {
    const ok = await confirm({
      title: "사용자 삭제",
      message: `"${u.name}"(${u.email}) 계정을 완전히 삭제할까요?\n되돌릴 수 없습니다.`,
      confirmText: "삭제", danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "삭제 실패"); return; }
    load();
  }

  if (!loaded) return <p style={{ color: "var(--ink-faint)" }}>불러오는 중…</p>;

  return (
    <div style={{ maxWidth: 720 }}>
      {err && <p className="err-msg">{err}</p>}
      <div className="admin-section-title">사용자 {users.length}명</div>
      <div className="admin-list">
        {users.map((u) => (
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
              {u.team && <span className="chip"><span className="dot" style={{ background: u.team.color }} />{u.team.name}</span>}
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
        {users.length === 0 && (
          <div className="card" style={{ padding: 30, textAlign: "center", color: "var(--ink-faint)" }}>사용자가 없습니다.</div>
        )}
      </div>

      {editing && (
        <EditModal
          user={editing}
          teams={teams}
          isSelf={editing.id === currentUserId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function EditModal({
  user, teams, isSelf, onClose, onSaved,
}: {
  user: UserRow; teams: TeamOpt[]; isSelf: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [role, setRole] = useState(user.role);
  const [teamId, setTeamId] = useState(user.team?.id ?? teams[0]?.id ?? "");
  const [active, setActive] = useState(user.status === "active");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setErr("");
    const body: any = { role, teamId: isTeamRole(role) ? teamId : null };
    if (!isSelf) body.status = active ? "active" : "disabled";
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{user.name} — 편집</h2>

        <div className="field">
          <label>역할</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {isTeamRole(role) ? (
          <div className="field">
            <label>소속 팀</label>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--ink-faint)", margin: "0 0 8px" }}>
            과장·부과장·서기·최고관리자는 <b>모든 팀</b>을 조회합니다. (소속 팀 없음)
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

        {err && <p className="err-msg">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
