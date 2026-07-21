"use client";
import { ModalClose } from "@/components/ModalClose";

import { useCallback, useRef, useState } from "react";
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
type Viewable = { id: string; name: string; teamName: string };

const PERSONAL_COLOR = "#7d5ef7"; // 개인 일정 색 (보라)

// 로컬 시각 HH:mm — 달력 셀·상세에서 시간 표기용
function hhmm(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PersonalCalendar({ meName, viewables }: { meName: string; viewables: Viewable[] }) {
  const calRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<PEvent[]>([]);
  const [target, setTarget] = useState(""); // "" = 나
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [curStart, setCurStart] = useState<Date | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState("");
  const [editing, setEditing] = useState<PEvent | null>(null);
  const [viewing, setViewing] = useState<PEvent | null>(null); // 읽기 전용 상세

  const readOnly = target !== "";
  const api = () => calRef.current?.getApi();

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
  }, []);

  const refetch = useCallback(() => {
    if (range) fetchEvents(range.from, range.to, target);
  }, [range, target, fetchEvents]);
  useAutoRefresh(refetch, ["personal"]); // 자동 반영

  function changeTarget(id: string) {
    setTarget(id);
    if (range) fetchEvents(range.from, range.to, id);
  }

  const fcEvents = events.map((e) => {
    let end = e.endDate;
    if (e.allDay) {
      const d = new Date(e.endDate);
      d.setDate(d.getDate() + 1);
      end = d.toISOString();
    }
    // 시간 지정 일정은 제목 앞에 시각(HH:mm)을 붙여 달력에서 바로 보이게 한다
    return {
      id: e.id, title: e.allDay ? e.title : `${hhmm(e.startDate)} ${e.title}`, start: e.startDate, end, allDay: e.allDay,
      backgroundColor: PERSONAL_COLOR + "26", borderColor: PERSONAL_COLOR, textColor: PERSONAL_COLOR,
    };
  });

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
    const res = await fetch(isEdit ? `/api/personal-events/${event!.id}` : "/api/personal-events", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, location, memo, ...when }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
    onSaved();
  }

  async function remove() {
    const ok = await confirm({ title: "개인 일정 삭제", message: "이 일정을 삭제할까요?", confirmText: "삭제", danger: true });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/personal-events/${event!.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onSaved();
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
