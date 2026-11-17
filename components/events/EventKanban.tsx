"use client";
import { DateField, TimeField } from "@/components/DateTimePicker";
import { ModalClose } from "@/components/ModalClose";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import koLocale from "@fullcalendar/core/locales/ko";
import { Icon } from "@/components/icons";
import { useConfirm } from "@/components/ConfirmProvider";
import { LoadError } from "@/components/LoadError";
import { useAutoRefresh } from "@/components/useAutoRefresh";
import { EventFormModal } from "@/components/events/EventList";
import { ProgramModal, uid, type ProgramRow } from "@/components/ProgramModal";

type Team = { id: string; name: string; color: string };
type Person = { id: string; name: string } | null;
type Item = { id: string; title: string; status: "todo" | "doing" | "hold" | "done"; assignee: Person; dueDate: string | null; note: string };
type Brief = { dress: string; caution: string; delivery: string; contact: string };
type Position = { id: string; name: string; note: string; people: { id: string; name: string }[] };
type EventFull = {
  id: string; title: string; description: string; teams: Team[];
  eventDate: string | null; location: string; createdBy: string | null; items: Item[];
  meetTime: string; meetPlace: string; brief: Brief; positions: Position[];
  program: ProgramRow[];
  closedAt: string | null;
};

// 상태색 — 디자인 토큰 사용 (다크모드 자동 대응)
const COLS: { key: Item["status"]; label: string; color: string }[] = [
  { key: "todo", label: "할 일", color: "var(--st-todo)" },
  { key: "doing", label: "진행중", color: "var(--primary)" },
  { key: "hold", label: "보류", color: "var(--st-prog)" },
  { key: "done", label: "완료", color: "var(--st-done)" },
];
function ddayOf(iso: string | null) {
  if (!iso) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return { label: "D-DAY", tone: "urgent" as const };
  if (diff > 0) return { label: `D-${diff}`, tone: (diff <= 3 ? "urgent" : diff <= 14 ? "soon" : "far") as "urgent" | "soon" | "far" };
  return { label: `D+${-diff}`, tone: "past" as const };
}
const toPayload = (items: Item[]) =>
  items.map((it) => ({ id: it.id, title: it.title, status: it.status, assigneeId: it.assignee?.id ?? null, dueDate: it.dueDate, note: it.note }));
// 집합 시간 "13:30" → "오후 1:30"
function fmtMeet(t: string) {
  if (!/^\d{2}:\d{2}$/.test(t)) return "";
  const h = Number(t.slice(0, 2));
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${t.slice(3)}`;
}
function dueInfo(iso: string | null, done: boolean) {
  if (!iso) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  const label = d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  const overdue = !done && diff < 0;
  return { label, overdue, soon: !done && diff >= 0 && diff <= 2 };
}

export default function EventKanban({ eventId, allTeams, canManage }: { eventId: string; allTeams: Team[]; canManage: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const [ev, setEv] = useState<EventFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [mineOnly, setMineOnly] = useState(false);
  const [view, setView] = useState<"board" | "calendar">("board");
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [itemModal, setItemModal] = useState<{ status: Item["status"]; item?: Item } | null>(null);
  const [editEvent, setEditEvent] = useState(false);
  const [programOpen, setProgramOpen] = useState(false);
  const [positionsOpen, setPositionsOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const [loadErr, setLoadErr] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}`);
      if (!res.ok) throw new Error(String(res.status));
      setEv((await res.json()).event);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);
  // 자동 반영 — 단, 모달·드래그 중에는 건너뛴다 (작업 방해 방지)
  useAutoRefresh(() => { if (!itemModal && !editEvent && !dragId && !programOpen && !positionsOpen) load(); }, ["event"]);

  // 담당자 후보 = 전체 활성 사용자 (팀 무관 지정 가능)
  useEffect(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => {
        // 시스템 관리자 계정은 빼고, 과원(과장·부과장·과원)을 먼저 — 그다음 부장단
        const order = (r: string) => (["leader", "vice_leader", "member"].includes(r) ? 0 : 1);
        const list = (d.users ?? []).filter((u: any) => u.role !== "admin")
          .sort((a: any, b: any) => order(a.role) - order(b.role) || a.name.localeCompare(b.name, "ko"));
        setMembers(list.map((u: any) => ({ id: u.id, name: u.name })));
      })
      .catch(() => setMembers([]));
  }, []);

  const filtered = useMemo(() => {
    if (!ev) return [];
    let list = ev.items;
    if (mineOnly) list = list.filter((i) => i.assignee?.id === myId);
    return list;
  }, [ev, mineOnly, myId]);

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

  const persistProgram = useCallback(async (program: ProgramRow[]) => {
    setEv((prev) => (prev ? { ...prev, program } : prev));
    await fetch(`/api/events/${eventId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program: program.map((p) => ({ id: p.id, time: p.time, title: p.title, note: p.note, must: !!p.must })) }),
    });
    load();
  }, [eventId, load]);

  const [posErr, setPosErr] = useState("");
  const persistPositions = useCallback(async (positions: Position[]) => {
    setPosErr("");
    setEv((prev) => (prev ? { ...prev, positions } : prev));
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positions: positions.map((p) => ({ id: p.id, name: p.name, note: p.note, userIds: p.people.map((x) => x.id) })) }),
    }).catch(() => null);
    if (!res?.ok) setPosErr((await res?.json().catch(() => null))?.error ?? "포지션을 저장하지 못했어요.");
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
  function saveItem(data: { title: string; assigneeId: string; dueDate: string; note: string; status: Item["status"] }, existing?: Item) {
    if (!ev) return;
    const assignee = members.find((m) => m.id === data.assigneeId) ?? null;
    const dueDate = data.dueDate || null;
    if (existing) {
      persist(ev.items.map((i) => (i.id === existing.id ? { ...i, title: data.title, assignee, dueDate, note: data.note, status: data.status } : i)));
    } else {
      persist([...ev.items, { id: uid(), title: data.title, status: data.status, assignee, dueDate, note: data.note }]);
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
    const ok = await confirm({
      title: "행사 삭제",
      message: `“${ev?.title}” 행사를 삭제할까요? 할 일도 함께 삭제됩니다.\n(30일 안에는 관리자에게 요청해 복구할 수 있어요)`,
      confirmText: "삭제", danger: true,
    });
    if (!ok) return;
    if (actBusy) return;
    setActBusy(true);
    try {
      await fetch(`/api/events/${eventId}`, { method: "DELETE" });
      router.push("/events");
    } finally {
      setActBusy(false);
    }
  }
  async function toggleClosed() {
    const closing = !ev?.closedAt;
    const ok = await confirm({
      title: closing ? "행사 종료" : "행사 재개",
      message: closing
        ? "행사를 종료(보관)할까요? 목록의 '종료된 행사'로 이동하고 홈·알림 집계에서 빠집니다."
        : "종료된 행사를 다시 진행 중으로 되돌릴까요?",
      confirmText: closing ? "종료" : "재개",
    });
    if (!ok) return;
    await fetch(`/api/events/${eventId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closed: closing }),
    });
    load();
  }
  const [actBusy, setActBusy] = useState(false); // 복제·삭제·종료 진행 중 — 연속 클릭 방지
  async function duplicateEvent() {
    if (actBusy) return;
    const ok = await confirm({ title: "행사 복제", message: "이 행사의 할 일 목록을 복사해 새 행사를 만듭니다. (상태·담당자·날짜는 초기화)", confirmText: "복제" });
    if (!ok) return;
    setActBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/duplicate`, { method: "POST" });
      const data = await res.json().catch(() => ({} as any));
      if (res.ok) router.push(`/events/${data.id}`);
    } catch { /* 네트워크 오류 — 버튼만 복구 */ } finally {
      setActBusy(false);
    }
  }

  if (loading) return <p className="muted-note">불러오는 중…</p>;
  if (loadErr) return <LoadError onRetry={() => { setLoading(true); load(); }} />;
  if (!ev) return <p className="muted-note">행사를 찾을 수 없습니다.</p>;

  const dday = ddayOf(ev.eventDate);
  // 진행률 요약 (전체 items 기준 — 필터와 무관)
  const totalCount = ev.items.length;
  const doneCount = ev.items.filter((i) => i.status === "done").length;
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;
  const myPositions = ev.positions.filter((p) => p.people.some((x) => x.id === myId)).map((p) => p.name);

  return (
    <div className="events">
      <Link href="/events" className="ev-back"><Icon name="chevronL" size={15} /> 행사 목록</Link>

      {/* 헤더 — 제목 + D-day, 아래에 날짜·장소·집합·내 포지션 칩 */}
      <div className="evd-head">
        <div className="evd-head-main">
          <div className="evd-title-row">
            <h1 className="page-title evd-title">{ev.title}</h1>
            {dday && <span className={`kb-dday ${dday.tone}`}>{dday.label}</span>}
          </div>
          <div className="evd-meta">
            {ev.eventDate && <span className="evd-chip"><Icon name="calendar" size={14} />{new Date(ev.eventDate).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })}</span>}
            {ev.location && <span className="evd-chip"><Icon name="mapPin" size={14} />{ev.location}</span>}
            {(ev.meetTime || ev.meetPlace) && <span className="evd-chip"><Icon name="clock" size={14} />집합 {[fmtMeet(ev.meetTime), ev.meetPlace].filter(Boolean).join(" · ")}</span>}
            {myPositions.length > 0 && <span className="evd-chip mine">🎯 내 포지션 {myPositions.join(", ")}</span>}
          </div>
        </div>
        {canManage && (
          <div className="evd-actions">
            <button className="btn btn-line btn-sm" onClick={() => setEditEvent(true)}>수정</button>
            <button className="btn btn-line btn-sm" disabled={actBusy} onClick={duplicateEvent}>복제</button>
            <button className="btn btn-line btn-sm" disabled={actBusy} onClick={toggleClosed}>{ev.closedAt ? "재개" : "종료"}</button>
            <button className="btn btn-danger btn-sm" disabled={actBusy} onClick={deleteEvent}>삭제</button>
          </div>
        )}
      </div>

      {ev.closedAt && (
        <p className="pc-banner" style={{ marginBottom: 12 }}>
          <Icon name="check" size={14} /> 종료된 행사입니다 ({new Date(ev.closedAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 종료)
        </p>
      )}

      {/* 정보 카드 — 알아야 할 내용 · 포지션 · 식순 (넓은 화면에선 나란히, 비어 있으면 작게) */}
      <div className="evd-grid">
        {(() => {
          const rows: [string, string, string][] = [
            ["⏰", "집합", [fmtMeet(ev.meetTime), ev.meetPlace].filter(Boolean).join(" · ")],
            ["⚠️", "촬영 주의", ev.brief.caution],
            ["👔", "복장", ev.brief.dress],
            ["📦", "납품", ev.brief.delivery],
            ["📞", "연락처", ev.brief.contact],
            ["📝", "메모", ev.description],
          ];
          const filled = rows.filter((r) => r[2].trim());
          if (filled.length === 0 && !canManage) return null;
          return (
            <section className={`card evd-card${filled.length ? "" : " empty"}`}>
              <div className="evd-card-head">
                <h2>📌 알아야 할 내용</h2>
                {canManage && <button className="evd-link" onClick={() => setEditEvent(true)}>{filled.length ? "편집" : "+ 작성"}</button>}
              </div>
              {filled.length === 0 ? (
                <p className="evd-empty">집합·촬영 주의·복장·납품·연락처를 적어두면 모두가 여기서 확인해요.</p>
              ) : (
                <dl className="evd-brief">
                  {filled.map(([ico, label, val]) => (
                    <div className={`evd-brief-row${label === "촬영 주의" ? " caution" : ""}`} key={label}>
                      <dt><span aria-hidden>{ico}</span> {label}</dt>
                      <dd>{val}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          );
        })()}

        {(canManage || ev.positions.length > 0) && (
          <section className={`card evd-card${ev.positions.length ? "" : " empty"}`}>
            <div className="evd-card-head">
              <h2>🎯 포지션{ev.positions.length > 0 && <span className="evd-count">{ev.positions.length}</span>}</h2>
              {canManage && <button className="evd-link" onClick={() => setPositionsOpen(true)}>{ev.positions.length ? "편집" : "+ 배치"}</button>}
            </div>
            {posErr && <p className="err-msg">{posErr}</p>}
            {ev.positions.length === 0 ? (
              <p className="evd-empty">중앙·상수·하수·부감·3층처럼 촬영 당일 서 있을 위치에 사람을 정해요.</p>
            ) : (
              <ul className="evd-pos">
                {ev.positions.map((p) => {
                  const mine = p.people.some((x) => x.id === myId);
                  return (
                    <li className={`evd-pos-row${mine ? " mine" : ""}`} key={p.id}>
                      <span className="evd-pos-name">{p.name}</span>
                      <span className="evd-pos-body">
                        <span className="evd-pos-people">
                          {p.people.length ? p.people.map((x) => <span key={x.id} className={x.id === myId ? "me" : ""}>{x.name}</span>) : <em>미배정</em>}
                        </span>
                        {p.note && <span className="evd-pos-note">{p.note}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {(canManage || ev.program.length > 0) && (
          <section className={`card evd-card${ev.program.length ? "" : " empty"}`}>
            <div className="evd-card-head">
              <h2>🕒 식순{ev.program.length > 0 && <span className="evd-count">{ev.program.length}</span>}</h2>
              {canManage && <button className="evd-link" onClick={() => setProgramOpen(true)}>{ev.program.length ? "편집" : "+ 만들기"}</button>}
            </div>
            {ev.program.length === 0 ? (
              <p className="evd-empty">{canManage ? "진행 순서를 적고, 꼭 찍어야 하는 순간은 ⭐필수 컷으로 표시해요." : "등록된 식순이 없어요."}</p>
            ) : (
              <ol className="evd-prog">
                {ev.program.map((p) => (
                  <li className={`evd-prog-row${p.must ? " must" : ""}`} key={p.id}>
                    <span className="evd-prog-time">{p.time || "—"}</span>
                    <span className="evd-prog-body">
                      <span className="evd-prog-title">{p.must && <span className="evd-must" title="필수 컷">⭐</span>}{p.title}</span>
                      {p.note && <span className="evd-prog-note">{p.note}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>

      {/* 할 일 — 제목 줄에 진행률을 합치고, 필터·보기 전환을 같은 줄에 */}
      <div className="evd-toolbar">
        <h2 className="evd-sec-title">✅ 할 일</h2>
        {totalCount > 0 && (
          <div className="evd-progress" title={`${totalCount}개 중 ${doneCount}개 완료`}>
            <div className="kb-check-bar"><span style={{ width: `${pct}%` }} /></div>
            <span>{pct === 100 ? "모두 완료 🎉" : <><b>{doneCount}</b>/{totalCount} 완료</>}</span>
          </div>
        )}
        <div className="evd-toolbar-right">
          <button className={`chip chip-btn${mineOnly ? " sel" : ""}`} onClick={() => setMineOnly((v) => !v)}>
            <Icon name="userLine" size={13} /> 내 담당만
          </button>
          <div className="seg" role="tablist" aria-label="보기 전환">
            <button className={view === "board" ? "on" : ""} onClick={() => setView("board")}>보드</button>
            <button className={view === "calendar" ? "on" : ""} onClick={() => setView("calendar")}>달력</button>
          </div>
        </div>
      </div>

      {view === "board" ? (
        <div className="kanban">
          {COLS.map((c, ci) => (
            <div
              key={c.key}
              className={`kb-col${dragOver === c.key ? " drop-over" : ""}`}
              style={{ "--col": c.color } as any}
              onDragOver={canManage ? (e) => { e.preventDefault(); if (dragOver !== c.key) setDragOver(c.key); } : undefined}
              onDragLeave={canManage ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((cur) => (cur === c.key ? null : cur)); } : undefined}
              onDrop={canManage ? () => handleDrop(c.key) : undefined}
            >
              <div className="kb-col-head">
                <span className="kb-col-title"><span className="dot" style={{ background: c.color }} />{c.label}</span>
                <span
                  className="kb-count"
                  style={byCol[c.key].length > 0 ? { background: `color-mix(in srgb, ${c.color} 13%, transparent)`, borderColor: "transparent", color: c.color } : undefined}
                >
                  {byCol[c.key].length}
                </span>
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
      ) : (
        <EventItemCalendar items={filtered} eventDate={ev.eventDate} onOpen={(it) => canManage && setItemModal({ status: it.status, item: it })} />
      )}

      {itemModal && (
        <ItemModal
          members={members} status={itemModal.status} item={itemModal.item}
          onClose={() => setItemModal(null)}
          onSave={saveItem}
          onDelete={itemModal.item ? () => deleteItem(itemModal.item!) : undefined}
        />
      )}
      {editEvent && (
        <EventFormModal teams={allTeams} ev={ev} onClose={() => setEditEvent(false)} onSaved={() => { setEditEvent(false); load(); }} />
      )}
      {positionsOpen && (
        <PositionsModal
          initial={ev.positions} members={members}
          onClose={() => setPositionsOpen(false)}
          onSave={(rows) => { setPositionsOpen(false); persistPositions(rows); }}
        />
      )}
      {programOpen && (
        <ProgramModal
          initial={ev.program}
          onClose={() => setProgramOpen(false)}
          onSave={(rows) => { setProgramOpen(false); persistProgram(rows); }}
        />
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
  const due = dueInfo(item.dueDate, item.status === "done");
  return (
    <div className={`kb-card${dragging ? " dragging" : ""}`} onClick={onOpen} role="button" tabIndex={0}
      draggable={canManage}
      onDragStart={canManage ? (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id); onDragStart(); } : undefined}
      onDragEnd={canManage ? onDragEnd : undefined}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="kb-card-title">{item.title}</div>
      {(item.assignee || due) && (
        <div className="kb-card-meta">
          {due && <span className={`due-badge${due.overdue ? " overdue" : due.soon ? " soon" : ""}`}>{due.overdue ? "지연 " : ""}{due.label}</span>}
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
  members, status, item, onClose, onSave, onDelete,
}: {
  members: { id: string; name: string }[]; status: Item["status"]; item?: Item;
  onClose: () => void; onSave: (d: { title: string; assigneeId: string; dueDate: string; note: string; status: Item["status"] }, existing?: Item) => void; onDelete?: () => void;
}) {
  const toDate = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [assigneeId, setAssigneeId] = useState(item?.assignee?.id ?? "");
  const [dueDate, setDueDate] = useState(toDate(item?.dueDate));
  const [note, setNote] = useState(item?.note ?? "");
  const [st, setSt] = useState<Item["status"]>(item?.status ?? status);
  const [err, setErr] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setErr("할 일 내용을 입력하세요."); return; }
    onSave({ title: title.trim(), assigneeId, dueDate, note: note, status: st }, item);
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>{item ? "할 일 수정" : "할 일 추가"}</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label>내용</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 단체 촬영 배치도 만들기" required autoFocus />
          </div>
          <div className="form-grid-2">
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
            <label>마감일 (선택)</label>
            <DateField value={dueDate} onChange={(v) => setDueDate(v)} clearable placeholder="마감일 없음" />
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
              <button className="btn btn-primary btn-sm">저장</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const STATUS_COLOR: Record<Item["status"], string> = { todo: "#8b95a1", doing: "#3182f6", hold: "#e8951b", done: "#22c55e" };

// 행사별 달력 — 그 행사의 투두를 마감일 기준으로 표시 (메인 달력과 분리)
function EventItemCalendar({ items, eventDate, onOpen }: { items: Item[]; eventDate: string | null; onOpen: (it: Item) => void }) {
  const events: any[] = items.filter((i) => i.dueDate).map((i) => {
    const color = STATUS_COLOR[i.status];
    return {
      id: i.id, title: i.title, start: i.dueDate!, allDay: true,
      backgroundColor: color + "26", borderColor: color, textColor: color,
      classNames: i.status === "done" ? ["ev-done"] : [],
      extendedProps: { itemId: i.id },
    };
  });
  if (eventDate) {
    events.push({
      id: "__eventdate", title: "🎯 행사일", start: eventDate, allDay: true,
      backgroundColor: "var(--accent-soft)", borderColor: "var(--primary)", textColor: "var(--primary)",
      extendedProps: { itemId: "" },
    });
  }
  const initialDate = eventDate ?? items.find((i) => i.dueDate)?.dueDate ?? undefined;

  return (
    <div className="card cal-card pc-cal" style={{ padding: 14 }}>
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        initialDate={initialDate}
        locale={koLocale}
        height="auto"
        headerToolbar={{ left: "title", right: "prev,today,next" }}
        buttonText={{ today: "오늘" }}
        dayCellContent={(arg) => String(arg.date.getDate())}
        dayMaxEvents={4}
        fixedWeekCount={false}
        moreLinkContent={(arg) => `+${arg.num}개`}
        eventDisplay="block"
        events={events}
        eventClick={(arg) => { const it = items.find((x) => x.id === arg.event.extendedProps.itemId); if (it) onOpen(it); }}
        noEventsContent="마감일이 지정된 할 일이 없습니다"
      />
    </div>
  );
}

/* ── 포지션 배치 편집 ── */
const POSITION_PRESETS = ["중앙", "상수", "하수", "부감", "3층", "4층", "백스테이지", "객석", "입구"];

function PositionsModal({ initial, members, onClose, onSave }: {
  initial: Position[]; members: { id: string; name: string }[];
  onClose: () => void; onSave: (rows: Position[]) => void;
}) {
  const [rows, setRows] = useState<Position[]>(initial.length ? initial : []);
  const [custom, setCustom] = useState("");
  const [pickFor, setPickFor] = useState<string | null>(null); // 사람 고르는 중인 포지션
  const [err, setErr] = useState("");
  const upd = (id: string, patch: Partial<Position>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const add = (name: string) => {
    const n = name.trim();
    if (!n) return;
    const id = uid();
    setRows((rs) => [...rs, { id, name: n.slice(0, 30), note: "", people: [] }]);
    setPickFor(id);
  };
  const moveRow = (i: number, dir: -1 | 1) => setRows((rs) => {
    const j = i + dir;
    if (j < 0 || j >= rs.length) return rs;
    const nx = [...rs];
    [nx[i], nx[j]] = [nx[j], nx[i]];
    return nx;
  });
  const togglePerson = (r: Position, m: { id: string; name: string }) =>
    upd(r.id, { people: r.people.some((x) => x.id === m.id) ? r.people.filter((x) => x.id !== m.id) : [...r.people, m] });
  const used = new Set(rows.map((r) => r.name));
  // 사람별 배정 수 — 여러 자리에 들어간 사람 표시용
  const count = new Map<string, number>();
  for (const r of rows) for (const x of r.people) count.set(x.id, (count.get(x.id) ?? 0) + 1);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rows.some((r) => !r.name.trim())) { setErr("포지션 이름을 입력하세요."); return; }
    onSave(rows.map((r) => ({ ...r, name: r.name.trim(), note: r.note.trim() })));
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>포지션 배치</h2>
        <p className="page-sub" style={{ marginTop: -4 }}>촬영 당일 서 있을 위치를 추가하고 사람을 배정해요. 배정되면 그 사람에게 알림이 가고 내 캘린더에 표시돼요.</p>
        <form onSubmit={submit}>
          <div className="pos-presets">
            {POSITION_PRESETS.map((p) => (
              <button type="button" key={p} className="chip chip-btn" disabled={used.has(p)} onClick={() => add(p)}>+ {p}</button>
            ))}
            <span className="pos-custom">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="직접 입력" maxLength={30}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(custom); setCustom(""); } }} />
              <button type="button" className="btn btn-line btn-sm" disabled={!custom.trim()} onClick={() => { add(custom); setCustom(""); }}>추가</button>
            </span>
          </div>

          {rows.length === 0 ? (
            <p className="muted-note" style={{ padding: "14px 0" }}>위에서 포지션을 눌러 추가하세요.</p>
          ) : (
            <div className="pos-edit">
              {rows.map((r, i) => (
                <div className="pos-edit-row" key={r.id}>
                  <div className="pos-edit-top">
                    <div className="prog-edit-move">
                      <button type="button" className="kb-move-btn" disabled={i === 0} onClick={() => moveRow(i, -1)} aria-label="위로"><Icon name="chevronL" size={15} /></button>
                      <button type="button" className="kb-move-btn" disabled={i === rows.length - 1} onClick={() => moveRow(i, 1)} aria-label="아래로"><Icon name="chevronR" size={15} /></button>
                    </div>
                    <input className="pos-edit-name" value={r.name} onChange={(e) => upd(r.id, { name: e.target.value })} maxLength={30} aria-label="포지션 이름" />
                    <button type="button" className="prog-edit-del" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label="포지션 삭제">×</button>
                  </div>
                  <div className="pos-edit-people">
                    {r.people.map((x) => (
                      <button type="button" key={x.id} className="chip chip-btn sel" onClick={() => togglePerson(r, x)} title="빼기">{x.name} ×</button>
                    ))}
                    <button type="button" className="chip chip-btn pos-add-person" onClick={() => setPickFor(pickFor === r.id ? null : r.id)}>
                      {pickFor === r.id ? "닫기" : "+ 사람"}
                    </button>
                  </div>
                  {pickFor === r.id && (
                    <div className="pos-picker">
                      {members.map((m) => {
                        const on = r.people.some((x) => x.id === m.id);
                        const elsewhere = (count.get(m.id) ?? 0) - (on ? 1 : 0);
                        return (
                          <button type="button" key={m.id} className={`chip chip-btn${on ? " sel" : ""}`} onClick={() => togglePerson(r, m)}>
                            {on && "✓ "}{m.name}{elsewhere > 0 && <em className="pos-elsewhere"> · 다른 자리 {elsewhere}</em>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <input className="pos-edit-note" value={r.note} onChange={(e) => upd(r.id, { note: e.target.value })} maxLength={200}
                    placeholder="역할 메모 (선택) — 예: 전체 와이드, 출연자 등·퇴장" />
                </div>
              ))}
            </div>
          )}
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary">저장</button>
          </div>
        </form>
      </div>
    </div>
  );
}
