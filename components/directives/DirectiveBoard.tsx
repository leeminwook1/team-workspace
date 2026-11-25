"use client";
import { DateField, TimeField } from "@/components/DateTimePicker";
import { ModalClose } from "@/components/ModalClose";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { useConfirm } from "@/components/ConfirmProvider";
import { LoadError } from "@/components/LoadError";
import { useAutoRefresh } from "@/components/useAutoRefresh";

type Team = { id: string; name: string; color: string };
type Person = { id: string; name: string } | null;
type Assignment = { id: string; user: Person; note: string; done: boolean; doneAt: string | null; readAt: string | null; taskId: string | null };
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
  converted: boolean;
  createdAt: string;
  doneAt: string | null; // 완료 시각
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
function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
}

export default function DirectiveBoard({ teams, canCreate }: { teams: Team[]; canCreate: boolean }) {
  const { data: session } = useSession();
  const user = session?.user;
  const [items, setItems] = useState<Directive[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all"); // 상태 필터 칩

  // 전역 검색에서 TODO를 고르면 ?q=제목 으로 들어옴 — 제목으로 필터
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  useEffect(() => { setQ(searchParams.get("q") ?? ""); }, [searchParams]);

  const [loadErr, setLoadErr] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/directives");
      if (!res.ok) throw new Error(String(res.status));
      setItems((await res.json()).directives ?? []);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, ["directive"]); // 새 TODO·상태 변경 자동 반영

  const canManage = (d: Directive) =>
    user?.role === "admin" || (user?.role === "leader" && !!d.team && user?.teamId === d.team.id);
  const canDelete = (d: Directive) => user?.role === "admin" || d.createdBy?.id === user?.id;

  const shown = items.filter((d) =>
    (statusFilter === "all" || d.status === statusFilter) &&
    (!q || (d.title ?? "").toLowerCase().includes(q.toLowerCase()))
  );
  const countOf = (s: string) => items.filter((d) => d.status === s).length;

  return (
    <div className="directives">
      <div className="page-head">
        <div>
          <h1 className="page-title">TODO</h1>
          <p className="page-sub">
            {canCreate ? "과원에게 할 일(TODO)을 보내고 누가 했는지 확인하세요." : "과장이 보낸 TODO예요. 다 하면 ‘완료’를 눌러주세요."}
          </p>
        </div>
        {canCreate && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={16} strokeWidth={2.4} /> TODO 보내기
          </button>
        )}
      </div>

      {loading ? (
        <p className="muted-note">불러오는 중…</p>
      ) : loadErr ? (
        <LoadError onRetry={() => { setLoading(true); load(); }} />
      ) : items.length === 0 ? (
        <p className="muted-note">{canCreate ? "아직 보낸 TODO가 없어요." : "받은 TODO가 없어요."}</p>
      ) : (
        <>
          {/* 상태 필터 칩 */}
          <div className="dir-filters">
            <button className={`chip chip-btn${statusFilter === "all" ? " sel" : ""}`} onClick={() => setStatusFilter("all")}>
              전체 <b className="dir-chip-n">{items.length}</b>
            </button>
            {Object.entries(STATUS).map(([key, [label, color]]) => {
              const n = countOf(key);
              if (n === 0) return null;
              return (
                <button key={key} className={`chip chip-btn${statusFilter === key ? " sel" : ""}`} onClick={() => setStatusFilter(key)}>
                  <span className="dot" style={{ background: color }} />{label} <b className="dir-chip-n">{n}</b>
                </button>
              );
            })}
          </div>

          {shown.length === 0 ? (
            <p className="muted-note">조건에 맞는 TODO가 없습니다.</p>
          ) : (
            <div className="dir-list">
              {shown.map((d) => (
                <DirectiveCard
                  key={d.id}
                  dir={d}
                  canManage={canManage(d)}
                  canDelete={canDelete(d)}
                  meId={user?.id ?? ""}
                  onChanged={load}
                />
              ))}
            </div>
          )}
        </>
      )}

      {createOpen && (
        <CreateModal teams={teams} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />
      )}
    </div>
  );
}

function DirectiveCard({
  dir, canManage, canDelete, meId, onChanged,
}: {
  dir: Directive; canManage: boolean; canDelete: boolean; meId: string; onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [stLabel, stColor] = STATUS[dir.status];
  const prio = PRIO[dir.priority] ?? PRIO.normal;
  const due = fmtDue(dir.dueDate);

  async function setStatus(status: string) {
    setBusy(true);
    const res = await fetch(`/api/directives/${dir.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      await confirm({ title: "상태 변경 실패", message: data.error ?? "상태를 변경하지 못했어요. 잠시 후 다시 시도해주세요.", confirmText: "확인", alert: true });
    }
    onChanged();
  }
  async function setMyDone(done: boolean) {
    setBusy(true);
    const res = await fetch(`/api/directives/${dir.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ myDone: done }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      await confirm({ title: "알림", message: data.error ?? "저장하지 못했어요. 잠시 후 다시 시도해주세요.", confirmText: "확인", alert: true });
    }
    onChanged();
  }
  const doneN = dir.assignments.filter((a) => a.done).length;
  async function convert(assignmentId?: string) {
    if (busy) return; // 중복 클릭 방지
    setBusy(true);
    const res = await fetch(`/api/directives/${dir.id}/convert`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assignmentId ? { assignmentId } : {}),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    onChanged();
    if (res.ok) {
      await confirm({ title: "등록 완료", message: "달력에 일정으로 등록되었습니다.", confirmText: "확인", alert: true });
    } else {
      await confirm({ title: "알림", message: data.error ?? "일정 등록에 실패했습니다.", confirmText: "확인", alert: true });
    }
  }
  async function remove() {
    const ok = await confirm({ title: "TODO 삭제", message: "이 TODO를 삭제할까요?", confirmText: "삭제", danger: true });
    if (!ok) return;
    setBusy(true);
    await fetch(`/api/directives/${dir.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className={`dir-card${dir.status === "done" ? " done" : ""}`}>
      <div className="dir-top">
        <span className="badge" style={{ background: `color-mix(in srgb, ${stColor} 14%, transparent)`, color: stColor }}>
          <span className="badge-dot" style={{ background: stColor }} />{stLabel}
        </span>
        {prio.show && (
          <span className="badge" style={{ background: `color-mix(in srgb, ${prio.color} 14%, transparent)`, color: prio.color }}>{prio.label}</span>
        )}
        {due && <span className="dir-due">마감 {due}</span>}
        {dir.assignments.length > 0 && (
          <span className={`dir-read ${doneN === dir.assignments.length ? "ok" : "prog"}`}>
            완료 {doneN}/{dir.assignments.length}
          </span>
        )}
        <span className="dir-meta-r">{dir.createdBy?.name ?? "?"} · {relTime(dir.createdAt)}</span>
      </div>

      <h3 className="dir-title">{dir.title}</h3>
      {dir.body && <p className="dir-body">{dir.body}</p>}

      {dir.assignments.length > 0 && (
        <div className="dir-assigns">
          {dir.assignments.map((a) => (
            <div className={`dir-assign${a.done ? " done" : ""}`} key={a.id}>
              <span className="avatar sm" aria-hidden>{a.user?.name?.slice(0, 1) ?? "?"}</span>
              <div className="dir-assign-body">
                <b>{a.user?.name ?? "알 수 없음"}</b>
                {a.note && <span className="dir-assign-note">{a.note}</span>}
              </div>
              {canManage && !a.done && (
                a.readAt ? (
                  <span className="dir-read ok" title={new Date(a.readAt).toLocaleString("ko-KR")}>읽음</span>
                ) : (
                  <span className="dir-read no">안 읽음{daysSince(dir.createdAt) >= 1 ? ` ${daysSince(dir.createdAt)}일째` : ""}</span>
                )
              )}
              {a.user?.id === meId ? (
                <button className={`btn btn-xs ${a.done ? "btn-line" : "btn-primary"}`} disabled={busy} onClick={() => setMyDone(!a.done)}>
                  {a.done ? "완료 취소" : "완료"}
                </button>
              ) : a.done ? (
                <span className="dir-conv-done" title={a.doneAt ? new Date(a.doneAt).toLocaleString("ko-KR") : undefined}>
                  <Icon name="check" size={13} strokeWidth={2.6} /> 완료
                </span>
              ) : null}
              {a.taskId ? (
                <span className="dir-conv-done"><Icon name="check" size={13} strokeWidth={2.6} /> 일정 등록됨</span>
              ) : canManage && !a.done ? (
                <button className="btn btn-line btn-xs" disabled={busy} onClick={() => convert(a.id)}>일정으로 등록</button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {(canManage || canDelete) && (
        <div className="dir-actions">
          {canManage && (
            <>
              <div className="seg dir-seg">
                {Object.entries(STATUS).map(([key, [label]]) => (
                  <button key={key} className={dir.status === key ? "on" : ""} disabled={busy} onClick={() => setStatus(key)}>{label}</button>
                ))}
              </div>
              <button className="btn btn-line btn-sm" onClick={() => setAssignOpen(true)}>
                <Icon name="userLine" size={14} /> 받는 과원
              </button>
              {dir.assignments.length === 0 && (
                dir.converted ? (
                  <span className="dir-conv-done"><Icon name="check" size={13} strokeWidth={2.6} /> 일정 등록됨</span>
                ) : (
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => convert()}>일정으로 등록</button>
                )
              )}
            </>
          )}
          {canDelete && (
            <button className="btn btn-line btn-xs" disabled={busy} onClick={() => setEditOpen(true)}>수정</button>
          )}
          {canDelete && (
            <button className="btn btn-danger btn-xs dir-del" disabled={busy} onClick={remove}>삭제</button>
          )}
        </div>
      )}

      {assignOpen && dir.team && (
        <AssignModal dir={dir} teamId={dir.team.id} onClose={() => setAssignOpen(false)} onSaved={() => { setAssignOpen(false); onChanged(); }} />
      )}
      {editOpen && (
        <EditModal dir={dir} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); onChanged(); }} />
      )}
    </div>
  );
}

type PickRows = Record<string, { on: boolean; note: string }>;
const DEPT_ROLES = ["leader", "vice_leader", "member"];

/** 과원 목록 (과장·부과장·과원) — 받는 사람 고르기용 */
function useDeptMembers(teamId: string) {
  const [members, setMembers] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    if (!teamId) { setMembers([]); return; }
    fetch(`/api/users?team=${teamId}`)
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setMembers((d.users ?? []).filter((u: any) => DEPT_ROLES.includes(u.role))))
      .catch(() => setMembers([]));
  }, [teamId]);
  return members;
}

/** 받는 과원 고르기 — 체크 + 각자 담당 내용 */
function MemberPicker({ members, rows, setRows, meId }: {
  members: { id: string; name: string }[] | null; rows: PickRows; setRows: (f: (p: PickRows) => PickRows) => void; meId?: string;
}) {
  if (members == null) return <p className="muted-note">불러오는 중…</p>;
  if (members.length === 0) return <p className="muted-note">등록된 과원이 없습니다.</p>;
  const others = members.filter((m) => m.id !== meId);
  const allOn = others.length > 0 && others.every((m) => rows[m.id]?.on);
  const n = members.filter((m) => rows[m.id]?.on).length;
  return (
    <>
      <div className="assign-head">
        <span>받는 과원 <b>{n}</b>명</span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setRows((p) => {
          const next = { ...p };
          others.forEach((m) => { next[m.id] = { on: !allOn, note: p[m.id]?.note ?? "" }; });
          return next;
        })}>{allOn ? "전체 해제" : "과원 전체 선택"}</button>
      </div>
      <div className="assign-rows">
        {members.map((m) => {
          const row = rows[m.id] ?? { on: false, note: "" };
          return (
            <div className={`assign-row${row.on ? " on" : ""}`} key={m.id}>
              <button type="button" className={`assign-check${row.on ? " on" : ""}`}
                onClick={() => setRows((p) => ({ ...p, [m.id]: { ...row, on: !row.on } }))}>
                {row.on && <Icon name="check" size={13} strokeWidth={2.8} />}
              </button>
              <span className="assign-name" onClick={() => setRows((p) => ({ ...p, [m.id]: { ...row, on: !row.on } }))}>{m.name}</span>
              <input className="assign-note" placeholder="담당 내용 (선택, 예: 촬영)" value={row.note}
                disabled={!row.on}
                onChange={(e) => setRows((p) => ({ ...p, [m.id]: { ...row, note: e.target.value } }))} />
            </div>
          );
        })}
      </div>
    </>
  );
}

function CreateModal({ teams, onClose, onSaved }: { teams: Team[]; onClose: () => void; onSaved: () => void }) {
  const { data: session } = useSession();
  const teamId = teams[0]?.id ?? "";
  const members = useDeptMembers(teamId);
  const [rows, setRows] = useState<PickRows>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const assignments = (members ?? []).filter((m) => rows[m.id]?.on).map((m) => ({ userId: m.id, note: rows[m.id]?.note ?? "" }));
    if (assignments.length === 0) { setErr("받을 과원을 1명 이상 골라주세요."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/directives", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, dueDate: dueDate || null, priority, assignments }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(data.error ?? "등록 실패"); return; }
      onSaved();
    } catch {
      setErr("네트워크 오류로 등록하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>TODO 보내기</h2>
        <form onSubmit={submit}>
          <p className="rsv-form-hint" style={{ marginTop: -6 }}>고른 과원에게 알림이 가고, 각자 다 하면 ‘완료’를 눌러요.</p>
          <div className="field">
            <label>제목</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 지난주 행사 사진 셀렉" required />
          </div>
          <div className="field">
            <label>내용 (선택)</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="세부 내용" />
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>마감일 (선택)</label>
              <DateField value={dueDate} onChange={(v) => setDueDate(v)} clearable placeholder="마감일 없음" />
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
          <div className="field">
            <MemberPicker members={members} rows={rows} setRows={setRows} meId={session?.user?.id} />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? "보내는 중…" : "TODO 보내기"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditModal({ dir, onClose, onSaved }: { dir: Directive; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(dir.title);
  const [body, setBody] = useState(dir.body ?? "");
  // dueDate는 UTC 자정으로 저장돼 slice(0,10)이 원래 yyyy-mm-dd로 왕복 — KST 어긋남 없음
  const [dueDate, setDueDate] = useState(dir.dueDate ? new Date(dir.dueDate).toISOString().slice(0, 10) : "");
  const [priority, setPriority] = useState(dir.priority || "normal");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!title.trim()) { setErr("제목을 입력하세요."); return; }
    setBusy(true);
    const res = await fetch(`/api/directives/${dir.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body, dueDate: dueDate || null, priority }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "수정 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>TODO 수정</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label>제목</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="field">
            <label>TODO 내용 (선택)</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="세부 내용" />
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>마감일 (선택)</label>
              <DateField value={dueDate} onChange={(v) => setDueDate(v)} clearable placeholder="마감일 없음" />
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
            <button className="btn btn-primary" disabled={busy}>{busy ? "저장 중…" : "수정 저장"}</button>
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
  const { data: session } = useSession();
  const members = useDeptMembers(teamId);
  const [rows, setRows] = useState<PickRows>(() => {
    const init: PickRows = {};
    dir.assignments.forEach((a) => { if (a.user?.id) init[a.user.id] = { on: true, note: a.note ?? "" }; });
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setErr("");
    const assignments = (members ?? [])
      .filter((m) => rows[m.id]?.on)
      .map((m) => ({ userId: m.id, note: rows[m.id]?.note ?? "" }));
    if (assignments.length === 0) { setErr("받을 과원을 1명 이상 골라주세요."); return; }
    setBusy(true);
    const res = await fetch(`/api/directives/${dir.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    });
    setBusy(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? "저장 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>받는 과원</h2>
        <p className="page-sub" style={{ marginTop: -4 }}>새로 추가한 과원에게는 알림이 가요. 이미 완료한 기록은 그대로 남아요.</p>
        <MemberPicker members={members} rows={rows} setRows={setRows} meId={session?.user?.id} />
        {err && <p className="err-msg">{err}</p>}
        <div className="modal-actions">
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
