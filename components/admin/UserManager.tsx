"use client";

import { useCallback, useEffect, useState } from "react";

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

  async function toggleStatus(u: UserRow) {
    setErr("");
    const nextStatus = u.status === "active" ? "disabled" : "active";
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "변경 실패"); return; }
    load();
  }

  if (!loaded) return <p style={{ color: "var(--ink-faint)" }}>불러오는 중…</p>;

  return (
    <div>
      {err && <p className="err-msg">{err}</p>}
      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr><th>이름</th><th>이메일</th><th>역할</th><th>소속 팀</th><th>상태</th><th style={{ width: 140 }} /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ opacity: u.status === "active" ? 1 : 0.5 }}>
                <td>{u.name}{u.id === currentUserId && " (나)"}</td>
                <td data-label="이메일" style={{ color: "var(--ink-soft)" }}>{u.email}</td>
                <td data-label="역할" style={{ fontWeight: 600 }}>{ROLE_LABEL[u.role] ?? u.role}</td>
                <td data-label="소속 팀">
                  {u.team ? (
                    <span className="chip"><span className="dot" style={{ background: u.team.color }} />{u.team.name}</span>
                  ) : (
                    <span style={{ color: "var(--ink-faint)", fontSize: 13 }}>전체</span>
                  )}
                </td>
                <td data-label="상태">
                  <span className={`status-pill ${u.status === "active" ? "pill-on" : "pill-off"}`}>
                    {u.status === "active" ? "활성" : "비활성"}
                  </span>
                </td>
                <td className="td-actions">
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>역할 편집</button>
                    {u.id !== currentUserId && (
                      <button
                        className={`btn btn-sm ${u.status === "active" ? "btn-danger" : "btn-ghost"}`}
                        onClick={() => toggleStatus(u)}
                      >
                        {u.status === "active" ? "비활성화" : "활성화"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ink-faint)", padding: 24 }}>사용자가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditRoleModal
          user={editing}
          teams={teams}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function EditRoleModal({
  user, teams, onClose, onSaved,
}: {
  user: UserRow; teams: TeamOpt[]; onClose: () => void; onSaved: () => void;
}) {
  const [role, setRole] = useState(user.role);
  const [teamId, setTeamId] = useState(user.team?.id ?? teams[0]?.id ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr("");
    const body = { role, teamId: isTeamRole(role) ? teamId : null };
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{user.name} — 역할 편집</h2>

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

        {err && <p className="err-msg">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
