"use client";
import { ModalClose } from "@/components/ModalClose";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { LoadError } from "@/components/LoadError";
import { useAutoRefresh } from "@/components/useAutoRefresh";

type Team = { id: string; name: string; color: string };
type EventSummary = {
  id: string;
  title: string;
  teams: Team[];
  manager: { id: string; name: string } | null;
  eventDate: string | null;
  location: string;
  priority: string;
  itemsTotal: number;
  itemsDone: number;
  closedAt: string | null;
};

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
  return iso ? new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) : "";
}

export default function EventList({ teams, canManage }: { teams: Team[]; canManage: boolean }) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [loadErr, setLoadErr] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      if (!res.ok) throw new Error(String(res.status));
      setEvents((await res.json()).events ?? []);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load); // 다른 사람 변경 자동 반영

  return (
    <div className="events">
      <div className="page-head">
        <div>
          <h1 className="page-title">행사 관리</h1>
          <p className="page-sub">행사를 클릭하면 그 행사의 할 일(투두) 보드가 열립니다.</p>
        </div>
        {canManage && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={16} strokeWidth={2.4} /> 행사 추가
          </button>
        )}
      </div>

      {loading ? (
        <p className="muted-note">불러오는 중…</p>
      ) : loadErr ? (
        <LoadError onRetry={() => { setLoading(true); load(); }} />
      ) : events.length === 0 ? (
        <p className="muted-note">아직 등록된 행사가 없습니다.</p>
      ) : (
        (() => {
          // 종료(보관)된 행사와 지난 행사(행사일이 지난 것)는 아래 섹션으로 분리
          const t0 = new Date(); t0.setHours(0, 0, 0, 0);
          const isPast = (ev: EventSummary) => !!ev.eventDate && new Date(ev.eventDate).getTime() < t0.getTime();
          const closed = events.filter((e) => e.closedAt);
          const active = events.filter((e) => !e.closedAt);
          const ongoing = active.filter((e) => !isPast(e));
          const past = active.filter(isPast);
          const renderCard = (ev: EventSummary) => {
            const dday = ddayOf(ev.eventDate);
            const prio = PRIO[ev.priority] ?? PRIO.normal;
            const pct = ev.itemsTotal ? Math.round((ev.itemsDone / ev.itemsTotal) * 100) : 0;
            const allDone = ev.itemsTotal > 0 && ev.itemsDone === ev.itemsTotal;
            return (
              <Link href={`/events/${ev.id}`} key={ev.id} className="ev-item">
                <div className="ev-item-top">
                  <div className="kb-teams">
                    {ev.teams.map((t) => <span className="dot" key={t.id} style={{ background: t.color }} title={t.name} />)}
                  </div>
                  {dday && <span className={`kb-dday ${dday.tone}`}>{dday.label}</span>}
                  {prio.show && (
                    <span className="badge" style={{ background: `color-mix(in srgb, ${prio.color} 14%, transparent)`, color: prio.color }}>{prio.label}</span>
                  )}
                </div>
                <div className="ev-item-title">{ev.title}</div>
                <div className="ev-item-meta">
                  {ev.eventDate && <span>{fmtDate(ev.eventDate)}</span>}
                  {ev.manager && <span>· {ev.manager.name}</span>}
                  {ev.location && <span>· {ev.location}</span>}
                </div>
                <div className="ev-item-foot">
                  <div className="kb-check-bar"><span style={{ width: `${pct}%` }} /></div>
                  {ev.itemsTotal ? (
                    <span className={`ev-item-count${allDone ? " done" : ""}`}>
                      {allDone ? "완료" : <><b>{pct}%</b> · {ev.itemsDone}/{ev.itemsTotal}</>}
                    </span>
                  ) : (
                    <span className="ev-item-count">할 일 없음</span>
                  )}
                </div>
              </Link>
            );
          };
          return (
            <>
              <div className="ev-grid">{ongoing.map(renderCard)}</div>
              {ongoing.length === 0 && <p className="muted-note">진행 중인 행사가 없습니다.</p>}
              {past.length > 0 && (
                <>
                  <div className="admin-section-title" style={{ marginTop: 28 }}>지난 행사 {past.length}</div>
                  <div className="ev-grid ev-grid-past">{past.map(renderCard)}</div>
                </>
              )}
              {closed.length > 0 && (
                <>
                  <div className="admin-section-title" style={{ marginTop: 28 }}>종료된 행사 {closed.length}</div>
                  <div className="ev-grid ev-grid-past">{closed.map(renderCard)}</div>
                </>
              )}
            </>
          );
        })()
      )}

      {createOpen && (
        <EventFormModal teams={teams} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />
      )}
    </div>
  );
}

export function EventFormModal({
  teams, ev, onClose, onSaved,
}: {
  teams: Team[]; ev?: any; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!ev;
  const toDate = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
  const [title, setTitle] = useState(ev?.title ?? "");
  const [teamIds, setTeamIds] = useState<string[]>(ev ? ev.teams.map((t: Team) => t.id) : (teams[0] ? [teams[0].id] : []));
  const [managerId, setManagerId] = useState(ev?.manager?.id ?? "");
  const [eventDate, setEventDate] = useState(toDate(ev?.eventDate ?? null));
  const [location, setLocation] = useState(ev?.location ?? "");
  const [priority, setPriority] = useState(ev?.priority ?? "normal");
  const [description, setDescription] = useState(ev?.description ?? "");
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // 담당자 후보 = 전체 활성 사용자 (팀에 안 묶인 과장·부과장 등도 지정 가능)
  useEffect(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setMembers((d.users ?? []).map((u: any) => ({ id: u.id, name: u.name }))))
      .catch(() => setMembers([]));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (teamIds.length === 0) { setErr("참여 팀을 하나 이상 선택하세요."); return; }
    setBusy(true);
    const res = await fetch(isEdit ? `/api/events/${ev.id}` : "/api/events", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, teamIds, managerId: managerId || null, eventDate: eventDate || null, location, priority, description }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>{isEdit ? "행사 수정" : "행사 추가"}</h2>
        <form onSubmit={save}>
          <div className="field">
            <label>행사명</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026 봄 정기공연" required />
          </div>
          <div className="field">
            <label>참여 팀 · 여러 팀 선택 가능</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {teams.map((t) => (
                <button type="button" key={t.id}
                  className={`chip chip-btn${teamIds.includes(t.id) ? " sel" : ""}`}
                  onClick={() => setTeamIds((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]))}>
                  <span className="dot" style={{ background: t.color }} />{t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>행사일 (선택)</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div className="field">
              <label>담당자 (선택)</label>
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">없음</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                {ev?.manager && !members.some((m) => m.id === ev.manager.id) && <option value={ev.manager.id}>{ev.manager.name}</option>}
              </select>
            </div>
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>우선순위</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">낮음</option><option value="normal">보통</option>
                <option value="high">높음</option><option value="urgent">긴급</option>
              </select>
            </div>
            <div className="field">
              <label>장소 (선택)</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예: 대극장" />
            </div>
          </div>
          <div className="field">
            <label>설명 (선택)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? "저장 중…" : isEdit ? "저장" : "등록"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
