"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmProvider";

type PendingUser = { id: string; name: string; email: string; requestedAt: string };
type TeamOpt = { id: string; name: string; color: string };

const TEAM_ROLES = [
  { value: "member", label: "팀원" },
  { value: "vice_leader", label: "부팀장" },
  { value: "leader", label: "팀장" },
];
const ORG_ROLES = [
  { value: "", label: "없음 (일반)" },
  { value: "manager", label: "과장" },
  { value: "deputy", label: "부과장" },
  { value: "secretary", label: "서기" },
  { value: "admin", label: "최고관리자" },
];

export default function ApprovalList({ teams, isAdmin }: { teams: TeamOpt[]; isAdmin: boolean }) {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 사용자별 선택값
  const [sel, setSel] = useState<Record<string, { teamId: string; role: string; orgRole: string }>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/pending");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users ?? []);
    }
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  function getSel(id: string) {
    return sel[id] ?? { teamId: teams[0]?.id ?? "", role: "member", orgRole: "" };
  }

  async function approve(u: PendingUser) {
    const s = getSel(u.id);
    setBusy(u.id);
    setErr("");
    const body: any = { teams: s.teamId ? [{ teamId: s.teamId, role: s.role }] : [] };
    if (s.orgRole) body.orgRole = s.orgRole;
    const res = await fetch(`/api/admin/users/${u.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy("");
    if (!res.ok) { setErr(data.error ?? "승인 실패"); return; }
    load();
  }

  async function reject(u: PendingUser) {
    const ok = await confirm({
      title: "가입 거절",
      message: `${u.name}(${u.email})의 가입 신청을 거절할까요?\n거절하면 신청 내역이 삭제됩니다.`,
      confirmText: "거절",
      danger: true,
    });
    if (!ok) return;
    setBusy(u.id);
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    setBusy("");
    if (!res.ok) { setErr(data.error ?? "거절 실패"); return; }
    load();
  }

  if (!loaded) return <p style={{ color: "var(--ink-faint)" }}>불러오는 중…</p>;

  if (users.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-faint)" }}>
        승인 대기 중인 가입 신청이 없습니다.
      </div>
    );
  }

  return (
    <div className="card table-wrap">
      {err && <p className="err-msg" style={{ padding: "8px 14px 0" }}>{err}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>이름</th><th>이메일</th><th>소속 팀</th><th>팀 역할</th>
            {isAdmin && <th>전사 역할</th>}
            <th style={{ width: 160 }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const s = getSel(u.id);
            return (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td data-label="이메일" style={{ color: "var(--ink-soft)" }}>{u.email}</td>
                <td data-label="소속 팀">
                  <select
                    value={s.teamId}
                    onChange={(e) => setSel({ ...sel, [u.id]: { ...s, teamId: e.target.value } })}
                    className="mini-select"
                  >
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </td>
                <td data-label="팀 역할">
                  <select
                    value={s.role}
                    onChange={(e) => setSel({ ...sel, [u.id]: { ...s, role: e.target.value } })}
                    className="mini-select"
                  >
                    {TEAM_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </td>
                {isAdmin && (
                  <td data-label="전사 역할">
                    <select
                      value={s.orgRole}
                      onChange={(e) => setSel({ ...sel, [u.id]: { ...s, orgRole: e.target.value } })}
                      className="mini-select"
                    >
                      {ORG_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                )}
                <td className="td-actions">
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-primary btn-sm" disabled={busy === u.id} onClick={() => approve(u)}>승인</button>
                    <button className="btn btn-danger btn-sm" disabled={busy === u.id} onClick={() => reject(u)}>거절</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
