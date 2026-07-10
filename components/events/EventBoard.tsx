"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { useConfirm } from "@/components/ConfirmProvider";

type Team = { id: string; name: string; color: string };
type Person = { id: string; name: string } | null;
type Check = { id: string; text: string; done: boolean };
type EventItem = {
  id: string;
  title: string;
  description: string;
  stage: "planning" | "preparing" | "ongoing" | "done";
  teams: Team[];
  manager: Person;
  eventDate: string | null;
  location: string;
  priority: string;
  checklist: Check[];
  createdBy: string | null;
};

const STAGES: { key: EventItem["stage"]; label: string; color: string }[] = [
  { key: "planning", label: "기획", color: "#8b95a1" },
  { key: "preparing", label: "준비", color: "#e8951b" },
  { key: "ongoing", label: "진행", color: "#3182f6" },
  { key: "done", label: "완료", color: "#22c55e" },
];
const PRIO: Record<string, { label: string; color: string; show: boolean }> = {
  low: { label: "낮음", color: "var(--ink-faint)", show: false },
  normal: { label: "보통", color: "var(--ink-faint)", show: false },
  high: { label: "높음", color: "var(--st-prog)", show: true },
  urgent: { label: "긴급", color: "var(--danger)", show: true },
};

function ddayOf(iso: string | null) {
  if (!iso) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return { label: "D-DAY", tone: "urgent" as const };
  if (diff > 0) return { label: `D-${diff}`, tone: diff <= 3 ? ("urgent" as const) : ("soon" as const) };
  return { label: `D+${-diff}`, tone: "past" as const };
}
function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export default function EventBoard({ teams, canManage }: { teams: Team[]; canManage: boolean }) {
  const confirm = useConfirm();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; ev?: EventItem } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/events");
    if (res.ok) setEvents((await res.json()).events ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const byStage = useMemo(() => {
    const m: Record<string, EventItem[]> = { planning: [], preparing: [], ongoing: [], done: [] };
    events.forEach((e) => { (m[e.stage] ?? m.planning).push(e); });
    return m;
  }, [events]);

  async function move(ev: EventItem, dir: -1 | 1) {
    const idx = STAGES.findIndex((s) => s.key === ev.stage);
    const next = STAGES[idx + dir];
    if (!next) return;
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, stage: next.key } : e))); // 낙관적
    await fetch(`/api/events/${ev.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: next.key }),
    });
    load();
  }

  async function remove(ev: EventItem) {
    const ok = await confirm({ title: "행사 삭제", message: `“${ev.title}” 행사를 삭제할까요?`, confirmText: "삭제", danger: true });
    if (!ok) return;
    await fetch(`/api/events/${ev.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="events">
      <div className="page-head">
        <div>
          <h1 className="page-title">행사 관리</h1>
          <p className="page-sub">행사를 단계별로 관리하세요. 카드의 화살표로 단계를 옮길 수 있습니다.</p>
        </div>
        {canManage && (
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ mode: "create" })}>
            <Icon name="plus" size={16} strokeWidth={2.4} /> 행사 추가
          </button>
        )}
      </div>

      {loading ? (
        <p className="muted-note">불러오는 중…</p>
      ) : (
        <div className="kanban">
          {STAGES.map((s, si) => (
            <div className="kb-col" key={s.key}>
              <div className="kb-col-head">
                <span className="kb-col-title"><span className="dot" style={{ background: s.color }} />{s.label}</span>
                <span className="kb-count">{byStage[s.key].length}</span>
              </div>
              <div className="kb-cards">
                {byStage[s.key].length === 0 && <div className="kb-empty">비어 있음</div>}
                {byStage[s.key].map((ev) => (
                  <EventCard
                    key={ev.id}
                    ev={ev}
                    stageIdx={si}
                    canManage={canManage}
                    onOpen={() => setModal({ mode: "edit", ev })}
                    onMove={(d) => move(ev, d)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <EventModal
          teams={teams}
          canManage={canManage}
          mode={modal.mode}
          ev={modal.ev}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
          onDelete={modal.ev ? () => { const e = modal.ev!; setModal(null); remove(e); } : undefined}
        />
      )}
    </div>
  );
}

function EventCard({
  ev, stageIdx, canManage, onOpen, onMove,
}: {
  ev: EventItem; stageIdx: number; canManage: boolean; onOpen: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const dday = ddayOf(ev.eventDate);
  const prio = PRIO[ev.priority] ?? PRIO.normal;
  const total = ev.checklist.length;
  const done = ev.checklist.filter((c) => c.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="kb-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="kb-card-top">
        <div className="kb-teams">
          {ev.teams.map((t) => <span className="dot" key={t.id} style={{ background: t.color }} title={t.name} />)}
        </div>
        {dday && <span className={`kb-dday ${dday.tone}`}>{dday.label}</span>}
        {prio.show && (
          <span className="badge" style={{ background: `color-mix(in srgb, ${prio.color} 14%, transparent)`, color: prio.color }}>{prio.label}</span>
        )}
      </div>

      <div className="kb-card-title">{ev.title}</div>
      <div className="kb-card-meta">
        {ev.eventDate && <span>{fmtDate(ev.eventDate)}</span>}
        {ev.manager && <span>· {ev.manager.name}</span>}
      </div>

      {total > 0 && (
        <div className="kb-check">
          <div className="kb-check-bar"><span style={{ width: `${pct}%` }} /></div>
          <span className="kb-check-n">{done}/{total}</span>
        </div>
      )}

      {canManage && (
        <div className="kb-move" onClick={(e) => e.stopPropagation()}>
          <button className="kb-move-btn" disabled={stageIdx === 0} onClick={() => onMove(-1)} aria-label="이전 단계">
            <Icon name="chevronL" size={15} />
          </button>
          <button className="kb-move-btn" disabled={stageIdx === STAGES.length - 1} onClick={() => onMove(1)} aria-label="다음 단계">
            <Icon name="chevronR" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function EventModal({
  teams, canManage, mode, ev, onClose, onSaved, onDelete,
}: {
  teams: Team[]; canManage: boolean; mode: "create" | "edit"; ev?: EventItem;
  onClose: () => void; onSaved: () => void; onDelete?: () => void;
}) {
  const ro = !canManage; // 읽기 전용(팀원)
  const toDate = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

  const [title, setTitle] = useState(ev?.title ?? "");
  const [teamIds, setTeamIds] = useState<string[]>(ev ? ev.teams.map((t) => t.id) : (teams[0] ? [teams[0].id] : []));
  const [managerId, setManagerId] = useState(ev?.manager?.id ?? "");
  const [eventDate, setEventDate] = useState(toDate(ev?.eventDate ?? null));
  const [location, setLocation] = useState(ev?.location ?? "");
  const [priority, setPriority] = useState(ev?.priority ?? "normal");
  const [description, setDescription] = useState(ev?.description ?? "");
  const [checklist, setChecklist] = useState<{ text: string; done: boolean }[]>(
    ev ? ev.checklist.map((c) => ({ text: c.text, done: c.done })) : []
  );
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (teamIds.length === 0) { setMembers([]); return; }
    Promise.all(teamIds.map((id) => fetch(`/api/users?team=${id}`).then((r) => (r.ok ? r.json() : { users: [] })).catch(() => ({ users: [] }))))
      .then((res) => {
        const map = new Map<string, { id: string; name: string }>();
        res.forEach((r) => (r.users ?? []).forEach((u: any) => map.set(u.id, { id: u.id, name: u.name })));
        setMembers(Array.from(map.values()));
      });
  }, [teamIds]);

  function toggleTeam(id: string) {
    if (ro) return;
    setTeamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (teamIds.length === 0) { setErr("참여 팀을 하나 이상 선택하세요."); return; }
    setBusy(true);
    const payload = {
      title, teamIds, managerId: managerId || null, eventDate: eventDate || null,
      location, priority, description,
      checklist: checklist.filter((c) => c.text.trim()).map((c) => ({ text: c.text.trim(), done: c.done })),
    };
    const res = await fetch(mode === "edit" ? `/api/events/${ev!.id}` : "/api/events", {
      method: mode === "edit" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
    onSaved();
  }

  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === "edit" ? (ro ? "행사 상세" : "행사 수정") : "행사 추가"}</h2>
        <form onSubmit={save}>
          <div className="field">
            <label>행사명</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026 봄 정기공연" required disabled={ro} />
          </div>

          <div className="field">
            <label>참여 팀 · 여러 팀 선택 가능</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {teams.map((t) => (
                <button type="button" key={t.id}
                  className={`chip chip-btn${teamIds.includes(t.id) ? " sel" : ""}`}
                  onClick={() => toggleTeam(t.id)} disabled={ro}>
                  <span className="dot" style={{ background: t.color }} />{t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="form-grid-2">
            <div className="field">
              <label>행사일 (선택)</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} disabled={ro} />
            </div>
            <div className="field">
              <label>담당자 (선택)</label>
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)} disabled={ro}>
                <option value="">없음</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                {ev?.manager && !members.some((m) => m.id === ev.manager!.id) && (
                  <option value={ev.manager.id}>{ev.manager.name}</option>
                )}
              </select>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="field">
              <label>우선순위</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} disabled={ro}>
                <option value="low">낮음</option>
                <option value="normal">보통</option>
                <option value="high">높음</option>
                <option value="urgent">긴급</option>
              </select>
            </div>
            <div className="field">
              <label>장소 (선택)</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예: 대극장" disabled={ro} />
            </div>
          </div>

          <div className="field">
            <label>설명 (선택)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={ro} />
          </div>

          {/* 체크리스트 */}
          <div className="field">
            <label>준비 체크리스트 {checklist.length > 0 && `· ${doneCount}/${checklist.length}`}</label>
            <div className="check-editor">
              {checklist.map((c, i) => (
                <div className="check-row" key={i}>
                  <button type="button" className={`assign-check${c.done ? " on" : ""}`}
                    onClick={() => setChecklist((p) => p.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}>
                    {c.done && <Icon name="check" size={13} strokeWidth={2.8} />}
                  </button>
                  <input className="assign-note" style={{ textDecoration: c.done ? "line-through" : "none" }}
                    value={c.text} placeholder="항목 내용" disabled={ro}
                    onChange={(e) => setChecklist((p) => p.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                  {!ro && (
                    <button type="button" className="check-del" onClick={() => setChecklist((p) => p.filter((_, j) => j !== i))} aria-label="삭제">×</button>
                  )}
                </div>
              ))}
              {!ro && (
                <button type="button" className="btn btn-line btn-xs" onClick={() => setChecklist((p) => [...p, { text: "", done: false }])}>
                  <Icon name="plus" size={13} strokeWidth={2.4} /> 항목 추가
                </button>
              )}
            </div>
          </div>

          {err && <p className="err-msg">{err}</p>}
          <div className="detail-actions">
            {mode === "edit" && onDelete && !ro && (
              <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>삭제</button>
            )}
            <div className="detail-actions-right">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
              {!ro && <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? "저장 중…" : "저장"}</button>}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
