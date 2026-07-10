"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { useConfirm } from "@/components/ConfirmProvider";
import { EventFormModal } from "@/components/events/EventList";

type Team = { id: string; name: string; color: string };
type Person = { id: string; name: string } | null;
type Item = { id: string; title: string; status: "todo" | "doing" | "hold" | "done"; team: Team | null; assignee: Person; note: string };
type EventFull = {
  id: string; title: string; description: string; teams: Team[]; manager: Person;
  eventDate: string | null; location: string; priority: string; createdBy: string | null; items: Item[];
};

const COLS: { key: Item["status"]; label: string; color: string }[] = [
  { key: "todo", label: "할 일", color: "#8b95a1" },
  { key: "doing", label: "진행중", color: "#3182f6" },
  { key: "hold", label: "보류", color: "#e8951b" },
  { key: "done", label: "완료", color: "#22c55e" },
];
function ddayOf(iso: string | null) {
  if (!iso) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return { label: "D-DAY", tone: "urgent" as const };
  if (diff > 0) return { label: `D-${diff}`, tone: diff <= 3 ? ("urgent" as const) : ("soon" as const) };
  return { label: `D+${-diff}`, tone: "past" as const };
}
const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tmp-${Math.random().toString(36).slice(2)}`);
const toPayload = (items: Item[]) =>
  items.map((it) => ({ id: it.id, title: it.title, status: it.status, teamId: it.team?.id ?? null, assigneeId: it.assignee?.id ?? null, note: it.note }));

export default function EventKanban({ eventId, teams, canManage }: { eventId: string; teams: Team[]; canManage: boolean }) {
  const confirm = useConfirm();
  const [ev, setEv] = useState<EventFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [itemModal, setItemModal] = useState<{ status: Item["status"]; item?: Item } | null>(null);
  const [editEvent, setEditEvent] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}`);
    if (res.ok) setEv((await res.json()).event);
    setLoading(false);
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  // 담당자 후보 = 전체 활성 사용자 (팀 무관 지정 가능)
  useEffect(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setMembers((d.users ?? []).map((u: any) => ({ id: u.id, name: u.name }))))
      .catch(() => setMembers([]));
  }, []);

  const filtered = useMemo(() => {
    if (!ev) return [];
    if (teamFilter === "all") return ev.items;
    if (teamFilter === "none") return ev.items.filter((i) => !i.team);
    return ev.items.filter((i) => i.team?.id === teamFilter);
  }, [ev, teamFilter]);

  const byCol = useMemo(() => {
    const m: Record<string, Item[]> = { todo: [], doing: [], hold: [], done: [] };
    filtered.forEach((i) => m[i.status].push(i));
    return m;
  }, [filtered]);

  const persist = useCallback(async (items: Item[]) => {
    setEv((prev) => (prev ? { ...prev, items } : prev));
    await fetch(`/api/events/${eventId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: toPayload(items) }),
    });
    load();
  }, [eventId, load]);

  function setStatus(item: Item, status: Item["status"]) {
    if (!ev || item.status === status) return;
    persist(ev.items.map((i) => (i.id === item.id ? { ...i, status } : i)));
  }
  function move(item: Item, dir: -1 | 1) {
    const idx = COLS.findIndex((c) => c.key === item.status);
    const next = COLS[idx + dir];
    if (next) setStatus(item, next.key);
  }
  function handleDrop(status: Item["status"]) {
    setDragOver(null);
    const item = ev?.items.find((i) => i.id === dragId);
    setDragId(null);
    if (item) setStatus(item, status);
  }
  function saveItem(data: { title: string; teamId: string; assigneeId: string; note: string; status: Item["status"] }, existing?: Item) {
    if (!ev) return;
    const team = teams.find((t) => t.id === data.teamId) ?? null;
    const assignee = members.find((m) => m.id === data.assigneeId) ?? null;
    if (existing) {
      persist(ev.items.map((i) => (i.id === existing.id ? { ...i, title: data.title, team, assignee, note: data.note, status: data.status } : i)));
    } else {
      persist([...ev.items, { id: uid(), title: data.title, status: data.status, team, assignee, note: data.note }]);
    }
    setItemModal(null);
  }
  async function deleteItem(item: Item) {
    if (!ev) return;
    const ok = await confirm({ title: "할 일 삭제", message: `“${item.title}”을(를) 삭제할까요?`, confirmText: "삭제", danger: true });
    if (!ok) return;
    persist(ev.items.filter((i) => i.id !== item.id));
    setItemModal(null);
  }
  async function deleteEvent() {
    const ok = await confirm({ title: "행사 삭제", message: `“${ev?.title}” 행사를 삭제할까요? 할 일도 함께 삭제됩니다.`, confirmText: "삭제", danger: true });
    if (!ok) return;
    await fetch(`/api/events/${eventId}`, { method: "DELETE" });
    window.location.href = "/events";
  }

  if (loading) return <p className="muted-note">불러오는 중…</p>;
  if (!ev) return <p className="muted-note">행사를 찾을 수 없습니다.</p>;

  const dday = ddayOf(ev.eventDate);

  return (
    <div className="events">
      <Link href="/events" className="ev-back"><Icon name="chevronL" size={15} /> 행사 목록</Link>

      <div className="page-head">
        <div>
          <div className="ev-detail-top">
            {ev.teams.map((t) => <span className="chip" key={t.id}><span className="dot" style={{ background: t.color }} />{t.name}</span>)}
            {dday && <span className={`kb-dday ${dday.tone}`}>{dday.label}</span>}
          </div>
          <h1 className="page-title" style={{ margin: "8px 0 4px" }}>{ev.title}</h1>
          <p className="page-sub">
            {ev.eventDate && new Date(ev.eventDate).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
            {ev.manager && ` · 담당 ${ev.manager.name}`}
            {ev.location && ` · ${ev.location}`}
          </p>
        </div>
        {canManage && (
          <div style={{ display: "flex", gap: 8, flex: "none" }}>
            <button className="btn btn-line btn-sm" onClick={() => setEditEvent(true)}>행사 수정</button>
            <button className="btn btn-danger btn-sm" onClick={deleteEvent}>삭제</button>
          </div>
        )}
      </div>

      {/* 팀별 필터 */}
      {teams.length > 1 && (
        <div className="filter-row" style={{ marginBottom: 14 }}>
          <span className="filter-label">팀</span>
          <button className={`chip chip-btn${teamFilter === "all" ? " sel" : ""}`} onClick={() => setTeamFilter("all")}>전체</button>
          {teams.map((t) => (
            <button key={t.id} className={`chip chip-btn${teamFilter === t.id ? " sel" : ""}`} onClick={() => setTeamFilter(t.id)}>
              <span className="dot" style={{ background: t.color }} />{t.name}
            </button>
          ))}
        </div>
      )}

      <div className="kanban">
        {COLS.map((c, ci) => (
          <div
            key={c.key}
            className={`kb-col${dragOver === c.key ? " drop-over" : ""}`}
            onDragOver={canManage ? (e) => { e.preventDefault(); if (dragOver !== c.key) setDragOver(c.key); } : undefined}
            onDragLeave={canManage ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((cur) => (cur === c.key ? null : cur)); } : undefined}
            onDrop={canManage ? () => handleDrop(c.key) : undefined}
          >
            <div className="kb-col-head">
              <span className="kb-col-title"><span className="dot" style={{ background: c.color }} />{c.label}</span>
              <span className="kb-count">{byCol[c.key].length}</span>
            </div>
            <div className="kb-cards">
              {byCol[c.key].length === 0 && <div className="kb-empty">{dragOver === c.key ? "여기에 놓기" : "비어 있음"}</div>}
              {byCol[c.key].map((it) => (
                <ItemCard
                  key={it.id} item={it} colIdx={ci} canManage={canManage}
                  dragging={dragId === it.id}
                  onDragStart={() => setDragId(it.id)}
                  onDragEnd={() => { setDragId(null); setDragOver(null); }}
                  onOpen={() => canManage && setItemModal({ status: it.status, item: it })}
                  onMove={(d) => move(it, d)}
                />
              ))}
            </div>
            {canManage && (
              <button className="kb-add" onClick={() => setItemModal({ status: c.key })}>
                <Icon name="plus" size={14} strokeWidth={2.4} /> 할 일 추가
              </button>
            )}
          </div>
        ))}
      </div>

      {itemModal && (
        <ItemModal
          teams={teams} members={members} status={itemModal.status} item={itemModal.item}
          onClose={() => setItemModal(null)}
          onSave={saveItem}
          onDelete={itemModal.item ? () => deleteItem(itemModal.item!) : undefined}
        />
      )}
      {editEvent && (
        <EventFormModal teams={teams} ev={ev} onClose={() => setEditEvent(false)} onSaved={() => { setEditEvent(false); load(); }} />
      )}
    </div>
  );
}

function ItemCard({
  item, colIdx, canManage, dragging, onDragStart, onDragEnd, onOpen, onMove,
}: {
  item: Item; colIdx: number; canManage: boolean; dragging: boolean;
  onDragStart: () => void; onDragEnd: () => void; onOpen: () => void; onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className={`kb-card${dragging ? " dragging" : ""}`} onClick={onOpen} role="button" tabIndex={0}
      draggable={canManage}
      onDragStart={canManage ? (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id); onDragStart(); } : undefined}
      onDragEnd={canManage ? onDragEnd : undefined}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="kb-card-title">{item.title}</div>
      {(item.team || item.assignee) && (
        <div className="kb-card-meta">
          {item.team && <span className="chip chip-xs"><span className="dot" style={{ background: item.team.color }} />{item.team.name}</span>}
          {item.assignee && <span>· {item.assignee.name}</span>}
        </div>
      )}
      {item.note && <div className="kb-card-note">{item.note}</div>}
      {canManage && (
        <div className="kb-move" onClick={(e) => e.stopPropagation()}>
          <button className="kb-move-btn" disabled={colIdx === 0} onClick={() => onMove(-1)} aria-label="이전 단계"><Icon name="chevronL" size={15} /></button>
          <button className="kb-move-btn" disabled={colIdx === COLS.length - 1} onClick={() => onMove(1)} aria-label="다음 단계"><Icon name="chevronR" size={15} /></button>
        </div>
      )}
    </div>
  );
}

function ItemModal({
  teams, members, status, item, onClose, onSave, onDelete,
}: {
  teams: Team[]; members: { id: string; name: string }[]; status: Item["status"]; item?: Item;
  onClose: () => void; onSave: (d: { title: string; teamId: string; assigneeId: string; note: string; status: Item["status"] }, existing?: Item) => void; onDelete?: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [teamId, setTeamId] = useState(item?.team?.id ?? (teams.length === 1 ? teams[0].id : ""));
  const [assigneeId, setAssigneeId] = useState(item?.assignee?.id ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [st, setSt] = useState<Item["status"]>(item?.status ?? status);
  const [err, setErr] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setErr("할 일 내용을 입력하세요."); return; }
    onSave({ title: title.trim(), teamId, assigneeId, note, status: st }, item);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <h2>{item ? "할 일 수정" : "할 일 추가"}</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label>내용</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 무대 조명 세팅" required autoFocus />
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>팀</label>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                <option value="">지정 안 함</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>담당자</label>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">없음</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                {item?.assignee && !members.some((m) => m.id === item.assignee!.id) && <option value={item.assignee.id}>{item.assignee.name}</option>}
              </select>
            </div>
          </div>
          <div className="field">
            <label>상태</label>
            <div className="seg" style={{ width: "100%" }}>
              {COLS.map((c) => (
                <button type="button" key={c.key} className={st === c.key ? "on" : ""} style={{ flex: 1 }} onClick={() => setSt(c.key)}>{c.label}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>메모 (선택)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="detail-actions">
            {onDelete && <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>삭제</button>}
            <div className="detail-actions-right">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>취소</button>
              <button className="btn btn-primary btn-sm">저장</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
