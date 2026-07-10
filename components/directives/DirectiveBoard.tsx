"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/icons";
import { useConfirm } from "@/components/ConfirmProvider";

type Team = { id: string; name: string; color: string };
type Person = { id: string; name: string } | null;
type Assignment = { id: string; user: Person; note: string; done: boolean; taskId: string | null };
type Directive = {
  id: string;
  title: string;
  body: string;
  team: Team | null;
  createdBy: Person;
  dueDate: string | null;
  priority: string;
  status: "todo" | "in_progress" | "done" | "hold";
  assignments: Assignment[];
  createdAt: string;
};

const STATUS: Record<Directive["status"], [string, string]> = {
  todo: ["대기", "var(--st-todo)"],
  in_progress: ["진행중", "var(--st-prog)"],
  done: ["완료", "var(--st-done)"],
  hold: ["보류", "var(--ink-faint)"],
};
const PRIO: Record<string, { label: string; color: string; show: boolean }> = {
  low: { label: "낮음", color: "var(--ink-faint)", show: false },
  normal: { label: "보통", color: "var(--ink-faint)", show: false },
  high: { label: "높음", color: "var(--st-prog)", show: true },
  urgent: { label: "긴급", color: "var(--danger)", show: true },
};

function fmtDue(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}
function relTime(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export default function DirectiveBoard({ teams, canCreate }: { teams: Team[]; canCreate: boolean }) {
  const { data: session } = useSession();
  const user = session?.user;
  const [items, setItems] = useState<Directive[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/directives");
    if (res.ok) setItems((await res.json()).directives ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const canManage = (d: Directive) =>
    user?.role === "admin" || (user?.role === "leader" && !!d.team && user?.teamId === d.team.id);
  const canDelete = (d: Directive) => user?.role === "admin" || d.createdBy?.id === user?.id;

  return (
    <div className="directives">
      <div className="page-head">
        <div>
          <h1 className="page-title">TODO</h1>
          <p className="page-sub">
            {canCreate ? "팀장에게 할 일(TODO)을 내려주고 진행 상황을 확인하세요." : "받은 TODO를 확인하고 팀원에게 분배하세요."}
          </p>
        </div>
        {canCreate && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={16} strokeWidth={2.4} /> TODO 내리기
          </button>
        )}
      </div>

      {loading ? (
        <p className="muted-note">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="muted-note">아직 TODO가 없습니다.</p>
      ) : (
        <div className="dir-list">
          {items.map((d) => (
            <DirectiveCard
              key={d.id}
              dir={d}
              canManage={canManage(d)}
              canDelete={canDelete(d)}
              onChanged={load}
            />
          ))}
        </div>
      )}

      {createOpen && (
        <CreateModal teams={teams} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />
      )}
    </div>
  );
}

function DirectiveCard({
  dir, canManage, canDelete, onChanged,
}: {
  dir: Directive; canManage: boolean; canDelete: boolean; onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [stLabel, stColor] = STATUS[dir.status];
  const prio = PRIO[dir.priority] ?? PRIO.normal;
  const due = fmtDue(dir.dueDate);

  async function setStatus(status: string) {
    setBusy(true);
    await fetch(`/api/directives/${dir.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    onChanged();
  }
  async function convert(assignmentId?: string) {
    setBusy(true);
    const res = await fetch(`/api/directives/${dir.id}/convert`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assignmentId ? { assignmentId } : {}),
    });
    setBusy(false);
    if (res.ok) onChanged();
    else { const e = await res.json().catch(() => ({})); console.error("convert:", e.error ?? res.status); onChanged(); }
  }
  async function remove() {
    const ok = await confirm({ title: "TODO 삭제", message: "이 TODO를 삭제할까요?", confirmText: "삭제", danger: true });
    if (!ok) return;
    setBusy(true);
    await fetch(`/api/directives/${dir.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="dir-card">
      <div className="dir-top">
        {dir.team && (
          <span className="chip"><span className="dot" style={{ background: dir.team.color }} />{dir.team.name}</span>
        )}
        <span className="badge" style={{ background: `color-mix(in srgb, ${stColor} 14%, transparent)`, color: stColor }}>
          <span className="badge-dot" style={{ background: stColor }} />{stLabel}
        </span>
        {prio.show && (
          <span className="badge" style={{ background: `color-mix(in srgb, ${prio.color} 14%, transparent)`, color: prio.color }}>{prio.label}</span>
        )}
        {due && <span className="dir-due">마감 {due}</span>}
        <span className="dir-meta-r">{dir.createdBy?.name ?? "?"} · {relTime(dir.createdAt)}</span>
      </div>

      <h3 className="dir-title">{dir.title}</h3>
      {dir.body && <p className="dir-body">{dir.body}</p>}

      {dir.assignments.length > 0 && (
        <div className="dir-assigns">
          {dir.assignments.map((a) => (
            <div className="dir-assign" key={a.id}>
              <span className="avatar sm" aria-hidden>{a.user?.name?.slice(0, 1) ?? "?"}</span>
              <div className="dir-assign-body">
                <b>{a.user?.name ?? "알 수 없음"}</b>
                {a.note && <span className="dir-assign-note">{a.note}</span>}
              </div>
              {a.taskId ? (
                <span className="dir-conv-done"><Icon name="check" size={13} strokeWidth={2.6} /> 일정 등록됨</span>
              ) : canManage ? (
                <button className="btn btn-line btn-xs" disabled={busy} onClick={() => convert(a.id)}>일정으로 등록</button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="dir-actions">
          <div className="seg dir-seg">
            {Object.entries(STATUS).map(([key, [label]]) => (
              <button key={key} className={dir.status === key ? "on" : ""} disabled={busy} onClick={() => setStatus(key)}>{label}</button>
            ))}
          </div>
          <button className="btn btn-line btn-sm" onClick={() => setAssignOpen(true)}>
            <Icon name="userLine" size={14} /> 팀원 분배
          </button>
          {dir.assignments.length === 0 && (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => convert()}>일정으로 등록</button>
          )}
        </div>
      )}

      {canDelete && (
        <div className="dir-foot">
          <button className="btn btn-danger btn-xs" disabled={busy} onClick={remove}>삭제</button>
        </div>
      )}

      {assignOpen && dir.team && (
        <AssignModal dir={dir} teamId={dir.team.id} onClose={() => setAssignOpen(false)} onSaved={() => { setAssignOpen(false); onChanged(); }} />
      )}
    </div>
  );
}

function CreateModal({ teams, onClose, onSaved }: { teams: Team[]; onClose: () => void; onSaved: () => void }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!teamId) { setErr("대상 팀을 선택하세요."); return; }
    setBusy(true);
    const res = await fetch("/api/directives", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, teamId, dueDate: dueDate || null, priority }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "등록 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>TODO 내리기</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label>대상 팀 · 이 팀의 팀장이 받습니다</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {teams.map((t) => (
                <button type="button" key={t.id}
                  className={`chip chip-btn${teamId === t.id ? " sel" : ""}`}
                  onClick={() => setTeamId(t.id)}>
                  <span className="dot" style={{ background: t.color }} />{t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>제목</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 홍보영상 콘티 초안 작성" required />
          </div>
          <div className="field">
            <label>TODO 내용 (선택)</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="세부 내용" />
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>마감일 (선택)</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="field">
              <label>우선순위</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">낮음</option>
                <option value="normal">보통</option>
                <option value="high">높음</option>
                <option value="urgent">긴급</option>
              </select>
            </div>
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? "내리는 중…" : "TODO 내리기"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AssignModal({
  dir, teamId, onClose, onSaved,
}: {
  dir: Directive; teamId: string; onClose: () => void; onSaved: () => void;
}) {
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<Record<string, { on: boolean; note: string }>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/users?team=${teamId}`)
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => {
        setMembers(d.users ?? []);
        const init: Record<string, { on: boolean; note: string }> = {};
        (d.users ?? []).forEach((u: any) => {
          const ex = dir.assignments.find((a) => a.user?.id === u.id);
          init[u.id] = { on: !!ex, note: ex?.note ?? "" };
        });
        setRows(init);
      });
  }, [teamId, dir.assignments]);

  async function save() {
    setBusy(true);
    const assignments = members
      .filter((m) => rows[m.id]?.on)
      .map((m) => ({ userId: m.id, note: rows[m.id]?.note ?? "", done: false }));
    await fetch(`/api/directives/${dir.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    });
    setBusy(false);
    onSaved();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>팀원 분배</h2>
        <p className="page-sub" style={{ marginTop: -4 }}>분배할 팀원을 고르고 담당 내용을 적어주세요.</p>
        {members.length === 0 ? (
          <p className="muted-note">이 팀에 등록된 팀원이 없습니다.</p>
        ) : (
          <div className="assign-rows">
            {members.map((m) => {
              const row = rows[m.id] ?? { on: false, note: "" };
              return (
                <div className={`assign-row${row.on ? " on" : ""}`} key={m.id}>
                  <button type="button" className={`assign-check${row.on ? " on" : ""}`}
                    onClick={() => setRows((p) => ({ ...p, [m.id]: { ...row, on: !row.on } }))}>
                    {row.on && <Icon name="check" size={13} strokeWidth={2.8} />}
                  </button>
                  <span className="assign-name">{m.name}</span>
                  <input className="assign-note" placeholder="담당 내용 (예: 촬영)" value={row.note}
                    disabled={!row.on}
                    onChange={(e) => setRows((p) => ({ ...p, [m.id]: { ...row, note: e.target.value } }))} />
                </div>
              );
            })}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "저장 중…" : "분배 저장"}</button>
        </div>
      </div>
    </div>
  );
}
