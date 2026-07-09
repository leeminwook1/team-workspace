"use client";

import { useCallback, useEffect, useState } from "react";

type TeamOpt = { id: string; name: string; color: string };
type UserRow = {
  id: string;
  name: string;
  email: string;
  orgRole: string | null;
  status: "active" | "disabled";
  teams: { teamId: string; teamName: string; teamColor: string; role: string }[];
};

const ORG_LABEL: Record<string, string> = {
  admin: "최고관리자", manager: "과장", deputy: "부과장", secretary: "서기",
};
const TEAM_ROLE_LABEL: Record<string, string> = {
  leader: "팀장", vice_leader: "부팀장", member: "팀원",
};

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
            <tr><th>이름</th><th>이메일</th><th>전사 역할</th><th>소속 팀</th><th>상태</th><th style={{ width: 140 }} /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ opacity: u.status === "active" ? 1 : 0.5 }}>
                <td style={{ fontWeight: 700 }}>{u.name}{u.id === currentUserId && " (나)"}</td>
                <td style={{ color: "var(--ink-soft)" }}>{u.email}</td>
                <td>{u.orgRole ? ORG_LABEL[u.orgRole] : <span style={{ color: "var(--ink-faint)" }}>—</span>}</td>
                <td>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {u.teams.length === 0 && <span style={{ color: "var(--ink-faint)", fontSize: 13 }}>없음</span>}
                    {u.teams.map((t) => (
                      <span key={t.teamId} className="chip">
                        <span className="dot" style={{ background: t.teamColor }} />
                        {t.teamName} · {TEAM_ROLE_LABEL[t.role]}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className={`status-pill ${u.status === "active" ? "pill-on" : "pill-off"}`}>
                    {u.status === "active" ? "활성" : "비활성"}
                  </span>
                </td>
                <td>
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
  const [orgRole, setOrgRole] = useState(user.orgRole ?? "");
  const [memberships, setMemberships] = useState<Record<string, string>>(
    Object.fromEntries(user.teams.map((t) => [t.teamId, t.role]))
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function toggleTeam(teamId: string) {
    setMemberships((prev) => {
      const next = { ...prev };
      if (teamId in next) delete next[teamId];
      else next[teamId] = "member";
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setErr("");
    const body = {
      orgRole: orgRole || null,
      teams: Object.entries(memberships).map(([teamId, role]) => ({ teamId, role })),
    };
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
          <label>전사 역할</label>
          <select value={orgRole} onChange={(e) => setOrgRole(e.target.value)}>
            <option value="">없음 (일반)</option>
            <option value="manager">과장</option>
            <option value="deputy">부과장</option>
            <option value="secretary">서기</option>
            <option value="admin">최고관리자</option>
          </select>
        </div>

        <div className="field">
          <label>소속 팀 (겸직 가능)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            {teams.map((t) => {
              const inTeam = t.id in memberships;
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    className="chip"
                    style={{
                      cursor: "pointer", minWidth: 90,
                      background: inTeam ? "var(--accent-soft)" : undefined,
                      borderColor: inTeam ? "var(--primary)" : undefined,
                      color: inTeam ? "var(--primary)" : undefined,
                    }}
                    onClick={() => toggleTeam(t.id)}
                  >
                    <span className="dot" style={{ background: t.color }} />
                    {t.name}
                  </button>
                  {inTeam && (
                    <select
                      value={memberships[t.id]}
                      onChange={(e) => setMemberships({ ...memberships, [t.id]: e.target.value })}
                      className="mini-select"
                    >
                      <option value="member">팀원</option>
                      <option value="vice_leader">부팀장</option>
                      <option value="leader">팀장</option>
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {err && <p className="err-msg">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
