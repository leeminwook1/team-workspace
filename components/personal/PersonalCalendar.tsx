"use client";
import { ModalClose } from "@/components/ModalClose";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import koLocale from "@fullcalendar/core/locales/ko";
import { Icon } from "@/components/icons";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAutoRefresh } from "@/components/useAutoRefresh";

type PEvent = {
  id: string; title: string; memo: string; location: string;
  startDate: string; endDate: string; allDay: boolean;
};
// 담당 업무 (팀 달력의 일정 중 이 캘린더 주인이 담당자인 것 — 읽기 전용 오버레이)
type ATask = {
  id: string; title: string; startDate: string; endDate: string; allDay: boolean;
  status: string;
  teams: { id: string; name: string; color: string }[];
  category?: { name: string; color: string } | null;
  assignees: { id: string; name: string }[];
};
type Viewable = { id: string; name: string; teamName: string };

const PERSONAL_COLOR = "#7d5ef7"; // 개인 일정 색 (보라)
const taskColor = (t: ATask) => t.category?.color ?? t.teams[0]?.color ?? "#8b95a1";

// 로컬 시각 HH:mm — 달력 셀·상세에서 시간 표기용
function hhmm(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PersonalCalendar({ meId, meName, viewables }: { meId: string; meName: string; viewables: Viewable[] }) {
  const calRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<PEvent[]>([]);
  const [assigned, setAssigned] = useState<ATask[]>([]); // 담당 업무 오버레이
  const [showTasks, setShowTasks] = useState(true);
  const [target, setTarget] = useState(""); // "" = 나
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [curStart, setCurStart] = useState<Date | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState("");
  const [editing, setEditing] = useState<PEvent | null>(null);
  const [viewing, setViewing] = useState<PEvent | null>(null); // 읽기 전용 상세

  const readOnly = target !== "";
  const api = () => calRef.current?.getApi();
  const router = useRouter();

  const [loadErr, setLoadErr] = useState(false);
  const fetchEvents = useCallback(async (from: string, to: string, user: string) => {
    try {
      const qs = new URLSearchParams({ from, to });
      if (user) qs.set("user", user);
      const res = await fetch(`/api/personal-events?${qs}`);
      if (!res.ok) throw new Error(String(res.status));
      setEvents((await res.json()).events ?? []);
      setLoadErr(false);
    } catch {
      setEvents([]);
      setLoadErr(true);
    }
    // 담당 업무 오버레이 — 팀 달력 일정 중 캘린더 주인이 담당자인 것 (내 조회 범위 내)
    try {
      const owner = user || meId;
      const res = await fetch(`/api/tasks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!res.ok) throw new Error(String(res.status));
      const all: ATask[] = (await res.json()).tasks ?? [];
      setAssigned(all.filter((t) => (t.assignees ?? []).some((a) => a.id === owner)));
    } catch {
      setAssigned([]);
    }
  }, [meId]);

  const refetch = useCallback(() => {
    if (range) fetchEvents(range.from, range.to, target);
  }, [range, target, fetchEvents]);
  useAutoRefresh(refetch, ["personal"]); // 자동 반영

  function changeTarget(id: string) {
    setTarget(id);
    if (range) fetchEvents(range.from, range.to, id);
  }

  const fcEvents = [
    ...events.map((e) => {
      let end = e.endDate;
      if (e.allDay) {
        const d = new Date(e.endDate);
        d.setDate(d.getDate() + 1);
        end = d.toISOString();
      }
      // 2줄 표기 — 위: 시간대(HH:mm–HH:mm), 아래: 제목. eventContent에서 렌더.
      const sameDay = new Date(e.startDate).toDateString() === new Date(e.endDate).toDateString();
      const timeText = e.allDay ? "" : sameDay ? `${hhmm(e.startDate)}–${hhmm(e.endDate)}` : `${hhmm(e.startDate)}~`;
      return {
        id: e.id, title: timeText ? `${e.title} (${timeText})` : e.title, start: e.startDate, end, allDay: e.allDay,
        backgroundColor: PERSONAL_COLOR + "26", borderColor: PERSONAL_COLOR, textColor: PERSONAL_COLOR,
        extendedProps: { timeText, mainText: e.title },
      };
    }),
    // 담당 업무 — 팀/카테고리 색, 클릭 시 팀 달력 상세로 이동 (여기선 읽기 전용)
    ...(showTasks ? assigned.map((t) => {
      let end = t.endDate;
      if (t.allDay) {
        const d = new Date(t.endDate);
        d.setDate(d.getDate() + 1);
        end = d.toISOString();
      }
      const color = taskColor(t);
      const sameDay = new Date(t.startDate).toDateString() === new Date(t.endDate).toDateString();
      const timeText = t.allDay ? "" : sameDay ? `${hhmm(t.startDate)}–${hhmm(t.endDate)}` : `${hhmm(t.startDate)}~`;
      return {
        id: `task:${t.id}`, title: t.title, start: t.startDate, end, allDay: t.allDay,
        backgroundColor: color + "26", borderColor: color, textColor: color,
        classNames: t.status === "done" ? ["ev-done"] : [],
        extendedProps: { timeText, mainText: `👤 ${t.title}`, taskId: t.id },
      };
    }) : []),
  ];

  const bigLabel = curStart ? `${curStart.getMonth() + 1}월` : "";
  const yearLabel = curStart ? String(curStart.getFullYear()) : "";
  const targetName = viewables.find((v) => v.id === target)?.name;

  return (
    <div className="cal-wrap pc-cal">
      <div className="cal-toolbar cal1c-head">
        <h2 className="cal1c-month">{bigLabel}</h2>
        <span className="cal1c-year">{yearLabel}</span>
        <div className="cal1c-nav">
          <button className="cal1c-arrow" aria-label="이전" onClick={() => api()?.prev()}><Icon name="chevronL" size={15} /></button>
          <button className="cal1c-arrow" aria-label="다음" onClick={() => api()?.next()}><Icon name="chevronR" size={15} /></button>
        </div>
        <button className="cal1c-today" onClick={() => api()?.today()}>오늘</button>
        <div className="cal-spacer" />
        {viewables.length > 0 && (
          <select className="pc-viewer" value={target} onChange={(e) => changeTarget(e.target.value)} aria-label="캘린더 주인 선택">
            <option value="">내 캘린더</option>
            {viewables.map((v) => (
              <option key={v.id} value={v.id}>{v.name}{v.teamName ? ` (${v.teamName})` : ""}</option>
            ))}
          </select>
        )}
        {!readOnly && (
          <button
            className="cal1c-add"
            onClick={() => { setCreateDate(new Date().toISOString().slice(0, 10)); setCreateOpen(true); }}
          >
            <Icon name="plus" size={15} strokeWidth={2.6} /> <span>개인 일정</span>
          </button>
        )}
      </div>

      {readOnly && (
        <p className="pc-banner">
          <Icon name="userLine" size={14} /> <b>{targetName}</b> 님의 개인 캘린더 — 읽기 전용
        </p>
      )}

      {/* 범례 + 담당 업무 오버레이 토글 */}
      <div className="pc-legend">
        <span className="pc-legend-item"><span className="dot" style={{ background: PERSONAL_COLOR }} />개인 일정</span>
        <button
          type="button"
          className={`chip chip-btn${showTasks ? " sel" : ""}`}
          onClick={() => setShowTasks((v) => !v)}
        >
          <Icon name="userLine" size={12} /> 담당 업무 {assigned.length > 0 ? `(${assigned.length})` : ""}
        </button>
        {showTasks && assigned.length > 0 && (
          <span className="pc-legend-hint">담당 업무는 팀 색으로 표시 — 클릭하면 팀 달력 상세로 이동</span>
        )}
      </div>
      {loadErr && (
        <p className="err-msg" style={{ marginTop: 10 }}>
          일정을 불러오지 못했어요. 네트워크 확인 후 <button className="rsv-linkbtn" style={{ color: "inherit", textDecoration: "underline" }} onClick={refetch}>다시 시도</button>
        </p>
      )}

      <div className="card cal-card" style={{ padding: 14, marginTop: readOnly ? 10 : 14 }}>
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={koLocale}
          height="auto"
          headerToolbar={false}
          dayCellContent={(arg) => String(arg.date.getDate())}
          dayMaxEvents={4}
          fixedWeekCount={false}
          moreLinkContent={(arg) => `+${arg.num}개`}
          eventDisplay="block"
          displayEventTime={false}
          events={fcEvents}
          eventContent={(arg) => {
            const { timeText, mainText } = arg.event.extendedProps as { timeText?: string; mainText?: string };
            return (
              <div className="ov-ev">
                {timeText ? <span className="ov-ev-time">{timeText}</span> : null}
                <span className="ov-ev-main">{mainText ?? arg.event.title}</span>
              </div>
            );
          }}
          datesSet={(arg) => {
            setCurStart(arg.view.currentStart);
            setRange({ from: arg.startStr, to: arg.endStr });
            fetchEvents(arg.startStr, arg.endStr, target);
          }}
          dateClick={(arg) => {
            if (readOnly) return;
            setCreateDate(arg.dateStr.slice(0, 10));
            setCreateOpen(true);
          }}
          eventClick={(arg) => {
            // 담당 업무 → 팀 달력의 상세로 이동
            const taskId = (arg.event.extendedProps as { taskId?: string }).taskId;
            if (taskId) { router.push(`/calendar?task=${taskId}`); return; }
            const e = events.find((x) => x.id === arg.event.id);
            if (!e) return;
            if (readOnly) setViewing(e);
            else setEditing(e);
          }}
        />
      </div>

      {createOpen && (
        <PersonalEventModal defaultDate={createDate} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); refetch(); }} />
      )}
      {editing && (
        <PersonalEventModal event={editing} defaultDate="" onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch(); }} />
      )}
      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <ModalClose onClose={() => setViewing(null)} />
            <h2 className="detail-title" style={{ marginTop: 4 }}>{viewing.title}</h2>
            <div className="meta-grid">
              <div className="meta"><div className="k">기간</div><div className="v">{periodLabel(viewing)}</div></div>
              {viewing.location && <div className="meta"><div className="k">장소</div><div className="v">{viewing.location}</div></div>}
            </div>
            {viewing.memo && (
              <>
                <div className="detail-section-label">메모</div>
                <div className="detail-desc">{viewing.memo}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function periodLabel(e: PEvent) {
  const s = new Date(e.startDate), en = new Date(e.endDate);
  const dateStr = (d: Date) => d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  const timeStr = (d: Date) => d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const sameDay = s.toDateString() === en.toDateString();
  if (e.allDay) return sameDay ? dateStr(s) : `${dateStr(s)} ~ ${dateStr(en)}`;
  if (sameDay) return `${dateStr(s)} · ${timeStr(s)} ~ ${timeStr(en)}`;
  return `${dateStr(s)} ${timeStr(s)} ~ ${dateStr(en)} ${timeStr(en)}`;
}

/* ── 개인 일정 등록/수정 모달 ── */
function PersonalEventModal({ event, defaultDate, onClose, onSaved }: {
  event?: PEvent; defaultDate: string; onClose: () => void; onSaved: () => void;
}) {
  const confirm = useConfirm();
  const isEdit = !!event;
  const pad = (n: number) => String(n).padStart(2, "0");
  const toDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const toTime = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const [title, setTitle] = useState(event?.title ?? "");
  const [allDay, setAllDay] = useState(event ? event.allDay : true);
  const [startDate, setStartDate] = useState(event ? toDate(event.startDate) : defaultDate);
  const [endDate, setEndDate] = useState(event ? toDate(event.endDate) : defaultDate);
  const [startTime, setStartTime] = useState(event && !event.allDay ? toTime(event.startDate) : "10:00");
  const [endTime, setEndTime] = useState(event && !event.allDay ? toTime(event.endDate) : "11:00");
  const [location, setLocation] = useState(event?.location ?? "");
  const [memo, setMemo] = useState(event?.memo ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (allDay && endDate < startDate) { setErr("종료일이 시작일보다 빠를 수 없어요."); return; }
    if (!allDay && endTime <= startTime) { setErr("종료 시각이 시작 시각보다 빨라요."); return; }
    setBusy(true);
    const when = allDay
      ? { startDate, endDate, allDay: true }
      : {
          startDate: new Date(`${startDate}T${startTime}`).toISOString(),
          endDate: new Date(`${startDate}T${endTime}`).toISOString(),
          allDay: false,
        };
    try {
      const res = await fetch(isEdit ? `/api/personal-events/${event!.id}` : "/api/personal-events", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, location, memo, ...when }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
      onSaved();
    } catch {
      setErr("네트워크 오류로 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({ title: "개인 일정 삭제", message: "이 일정을 삭제할까요?", confirmText: "삭제", danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/personal-events/${event!.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        setErr(data.error ?? "삭제하지 못했어요.");
        return;
      }
      onSaved();
    } catch {
      setErr("네트워크 오류로 삭제하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>{isEdit ? "개인 일정 수정" : "개인 일정 추가"}</h2>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>제목</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 병원 예약" required maxLength={120} />
          </div>
          <div className="field">
            <div className="switch-row">
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-soft)" }}>하루 종일</span>
              <button type="button" role="switch" aria-checked={allDay} className={`toggle${allDay ? " on" : ""}`} onClick={() => setAllDay(!allDay)}>
                <span className="toggle-knob" />
              </button>
            </div>
          </div>
          {allDay ? (
            <div className="form-grid-2">
              <div className="field"><label>시작일</label><input type="date" value={startDate} onChange={(e) => { const v = e.target.value; setStartDate(v); setEndDate((d) => (d < v ? v : d)); }} required /></div>
              <div className="field"><label>종료일</label><input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required /></div>
            </div>
          ) : (
            <>
              <div className="field"><label>날짜</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></div>
              <div className="form-grid-2">
                <div className="field"><label>시작 시각</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required /></div>
                <div className="field"><label>종료 시각</label><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required /></div>
              </div>
            </>
          )}
          <div className="field">
            <label>장소 (선택)</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />
          </div>
          <div className="field">
            <label>메모 (선택)</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={1000} />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions" style={{ justifyContent: "space-between" }}>
            {isEdit ? (
              <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={remove}>삭제</button>
            ) : <span />}
            <button className="btn btn-primary" disabled={busy}>{busy ? "저장 중…" : isEdit ? "저장" : "등록"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
