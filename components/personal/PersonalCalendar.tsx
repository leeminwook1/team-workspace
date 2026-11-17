"use client";
import { ModalClose } from "@/components/ModalClose";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import koLocale from "@fullcalendar/core/locales/ko";
import { Icon } from "@/components/icons";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAutoRefresh } from "@/components/useAutoRefresh";
import { parseQuickEntry, type QuickParsed } from "@/lib/quickEntry";

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

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
const pad2 = (n: number) => String(n).padStart(2, "0");
// 로컬 날짜 YYYY-MM-DD (toISOString은 UTC라 새벽 시간대에 하루 밀림)
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00`); d.setDate(d.getDate() + n); return ymd(d); };

// 로컬 시각 HH:mm — 달력 셀·상세에서 시간 표기용
function hhmm(iso: string) {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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
  const [createEnd, setCreateEnd] = useState(""); // 데스크톱 드래그로 여러 날 선택 시 종료일
  const [createPrefill, setCreatePrefill] = useState<QuickParsed | null>(null); // 한 줄 입력 → '자세히'
  const [editing, setEditing] = useState<PEvent | null>(null);
  const [viewing, setViewing] = useState<PEvent | null>(null); // 읽기 전용 상세
  const [isMobile, setIsMobile] = useState(false);
  const [mSel, setMSel] = useState(() => ymd(new Date())); // 모바일: 선택한 날짜

  const readOnly = target !== "";
  const api = () => calRef.current?.getApi();
  const router = useRouter();

  // 모바일(≤640px)은 칸이 좁아 제목이 안 보이므로 도트 달력 + 선택일 목록으로 전환
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // 데스크톱으로 돌아오면 숨겨져 있던 FullCalendar 크기 재계산
  useEffect(() => {
    if (!isMobile) setTimeout(() => api()?.updateSize(), 60);
  }, [isMobile]);
  // 달을 넘기면 선택일을 그 달로 보정 (오늘이 있으면 오늘, 없으면 1일)
  useEffect(() => {
    if (!curStart) return;
    const mk = `${curStart.getFullYear()}-${pad2(curStart.getMonth() + 1)}`;
    if (!mSel.startsWith(mk)) {
      const today = ymd(new Date());
      setMSel(today.startsWith(mk) ? today : `${mk}-01`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curStart]);

  function openCreate(day: string, endDay?: string) {
    if (readOnly) return;
    setCreateDate(day);
    setCreateEnd(endDay ?? day);
    setCreatePrefill(null);
    setCreateOpen(true);
  }
  // 등록한 날짜로 달력 이동 (다른 달이면 안 보이므로)
  function jumpTo(day: string) {
    api()?.gotoDate(day);
    setMSel(day);
  }

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
            onClick={() => openCreate(isMobile ? mSel : ymd(new Date()))}
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
      {!readOnly && (
        <QuickAdd
          fallbackDay={isMobile ? mSel : ymd(new Date())}
          onAdded={(day) => { if (day) jumpTo(day); refetch(); }}
          onDetail={(p) => { setCreatePrefill(p); setCreateDate(p.startDate); setCreateEnd(p.endDate); setCreateOpen(true); }}
        />
      )}
      {loadErr && (
        <p className="err-msg" style={{ marginTop: 10 }}>
          일정을 불러오지 못했어요. 네트워크 확인 후 <button className="rsv-linkbtn" style={{ color: "inherit", textDecoration: "underline" }} onClick={refetch}>다시 시도</button>
        </p>
      )}

      {/* 모바일: 도트 달력 + 선택일 목록 — FullCalendar는 숨기고 월 이동·조회만 사용 */}
      {isMobile && curStart && (
        <PersonalMobileMonth
          monthDate={curStart}
          events={events}
          tasks={showTasks ? assigned : []}
          selected={mSel}
          onSelect={setMSel}
          onEventClick={(e) => (readOnly ? setViewing(e) : setEditing(e))}
          onTaskClick={(t) => router.push(`/calendar?task=${t.id}`)}
          onAddAt={readOnly ? undefined : (day) => openCreate(day)}
        />
      )}

      <div className="card cal-card" style={{ padding: 14, marginTop: readOnly ? 10 : 14, display: isMobile ? "none" : undefined }}>
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
          // 날짜 클릭 = 그날 추가, 여러 날 드래그 = 기간 일정 추가 (end는 exclusive)
          selectable={!readOnly}
          select={(arg) => {
            const s = arg.startStr.slice(0, 10);
            const e = addDays(arg.endStr.slice(0, 10), -1);
            api()?.unselect();
            openCreate(s, e < s ? s : e);
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
        <PersonalEventModal defaultDate={createDate} defaultEndDate={createEnd} prefill={createPrefill} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); refetch(); }} />
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

/* ── 한 줄 빠른 입력 — "내일 오후 3시~5시 촬영 연습" 처럼 적고 Enter (lib/quickEntry.ts) ── */
function QuickAdd({ fallbackDay, onAdded, onDetail }: {
  fallbackDay: string; // 날짜를 안 적으면 쓸 날 (모바일: 선택한 날, PC: 오늘)
  onAdded: (day?: string) => void; // day 있으면 그 날로 이동, 없으면 새로고침만 (되돌리기)
  onDetail: (p: QuickParsed) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ id: string; label: string } | null>(null); // 방금 등록 (되돌리기용)
  const [showHelp, setShowHelp] = useState(false); // 입력 방법 안내

  const parsed = text.trim() ? parseQuickEntry(text, fallbackDay) : null;
  const label = (p: QuickParsed) => {
    const d = new Date(`${p.startDate}T00:00`);
    const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8))}`;
    const date = p.startDate === p.endDate
      ? `${md(p.startDate)}(${WEEKDAYS_KO[d.getDay()]})`
      : `${md(p.startDate)}~${md(p.endDate)}`;
    return `${date} ${p.allDay ? "하루 종일" : `${p.startTime}–${p.endTime}`}`;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed || busy) return;
    setErr("");
    if (!parsed.title) { setErr("제목도 같이 적어주세요. 예: 내일 3시 촬영 연습"); return; }
    if (!parsed.allDay && parsed.endTime <= parsed.startTime) { setErr("종료 시각이 시작보다 빨라요."); return; }
    setBusy(true);
    const when = parsed.allDay
      ? { startDate: parsed.startDate, endDate: parsed.endDate, allDay: true }
      : {
          startDate: new Date(`${parsed.startDate}T${parsed.startTime}`).toISOString(),
          endDate: new Date(`${parsed.startDate}T${parsed.endTime}`).toISOString(),
          allDay: false,
        };
    try {
      const res = await fetch("/api/personal-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: parsed.title, location: parsed.location, memo: "", ...when }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(data.error ?? "등록하지 못했어요."); return; }
      setDone({ id: data.id, label: `${label(parsed)} · ${parsed.title}` });
      setText("");
      onAdded(parsed.startDate);
    } catch {
      setErr("네트워크 오류로 등록하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!done) return;
    const res = await fetch(`/api/personal-events/${done.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) { setDone(null); onAdded(); }
    else setErr("되돌리지 못했어요.");
  }

  return (
    <form className="qa-wrap" onSubmit={submit}>
      <div className="qa-row">
        <Icon name="plus" size={16} strokeWidth={2.4} />
        <input
          className="qa-input" value={text} enterKeyHint="send" maxLength={200}
          onChange={(e) => { setText(e.target.value); setErr(""); setDone(null); }}
          placeholder="예: 내일 오후 3시 촬영 연습"
          aria-label="한 줄로 개인 일정 등록"
        />
        <button
          type="button" className={`qa-help-btn${showHelp ? " on" : ""}`}
          aria-label="입력 방법 보기" aria-expanded={showHelp} onClick={() => setShowHelp((v) => !v)}
        >?</button>
        <button className="qa-btn" disabled={!parsed || busy}>{busy ? "…" : "등록"}</button>
      </div>
      {showHelp && (
        <div className="qa-manual">
          <div className="qa-manual-head">
            <b>한 줄로 등록하는 법</b>
            <button type="button" className="qa-manual-x" aria-label="닫기" onClick={() => setShowHelp(false)}>✕</button>
          </div>
          <p>날짜 · 시간 · 제목을 순서 상관없이 적고 <b>Enter</b>. 아래 예시를 누르면 입력창에 들어가요.</p>
          <ul className="qa-examples">
            {["내일 오후 3시~5시 촬영 연습", "금요일 14-16 보정 작업", "11/20~11/22 외박", "다음주 화요일 3시 반 모임 @동아리방"].map((ex) => (
              <li key={ex}><button type="button" onClick={() => { setText(ex); setShowHelp(false); setErr(""); setDone(null); }}>{ex}</button></li>
            ))}
          </ul>
          <dl className="qa-rules">
            <div><dt>날짜</dt><dd>오늘 · 내일 · 모레 · 금요일 · 다음주 화요일 · 11/20 · 20일 · 기간은 11/20~11/22</dd></div>
            <div><dt>시간</dt><dd>오후 3시 · 3시 반 · 15:00 · 14-16 · 오후 3시~5시 (안 적으면 하루 종일, 시작만 적으면 1시간)</dd></div>
            <div><dt>장소</dt><dd>@동아리방 또는 장소:본관 3층</dd></div>
            <div><dt>팁</dt><dd>날짜를 안 적으면 오늘(모바일은 선택한 날) · 오전/오후 없이 1~7시는 오후로 · 메모는 ‘자세히’에서</dd></div>
          </dl>
        </div>
      )}
      {parsed && !err && (
        <div className="qa-preview">
          <span className="qa-when">📅 {label(parsed)}</span>
          <span className="qa-title">{parsed.title || <i>제목을 적어주세요</i>}</span>
          {parsed.location && <span className="qa-loc">📍 {parsed.location}</span>}
          {!parsed.dateFound && <span className="qa-note">날짜를 안 적으면 {fallbackDay === ymd(new Date()) ? "오늘" : "선택한 날"}로 등록돼요</span>}
          <button type="button" className="qa-detail" onClick={() => { onDetail(parsed); setText(""); }}>자세히 ›</button>
        </div>
      )}
      {err && <p className="err-msg qa-msg">{err}</p>}
      {done && !parsed && (
        <p className="qa-done">
          ✅ 등록했어요: {done.label}
          <button type="button" className="qa-undo" onClick={undo}>되돌리기</button>
        </p>
      )}
    </form>
  );
}

/* ── 모바일 월간 — 도트 달력 + 선택일 목록 (팀 달력 모바일 뷰와 같은 mc-* 스타일) ── */
function PersonalMobileMonth({ monthDate, events, tasks, selected, onSelect, onEventClick, onTaskClick, onAddAt }: {
  monthDate: Date; events: PEvent[]; tasks: ATask[]; selected: string;
  onSelect: (day: string) => void; onEventClick: (e: PEvent) => void; onTaskClick: (t: ATask) => void;
  onAddAt?: (day: string) => void; // 읽기 전용이면 미전달
}) {
  const today = ymd(new Date());
  const y = monthDate.getFullYear(), m = monthDate.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const offset = new Date(y, m, 1).getDay();
  const total = Math.ceil((offset + days) / 7) * 7;
  const cells = Array.from({ length: total }, (_, i) => {
    const d = new Date(y, m, i - offset + 1);
    return { day: ymd(d), num: d.getDate(), inMonth: d.getMonth() === m, wd: d.getDay() };
  });

  // 해당 날짜에 걸치는지 (allDay end는 inclusive)
  const covers = (x: { startDate: string; endDate: string }, day: string) =>
    ymd(new Date(x.startDate)) <= day && day <= ymd(new Date(x.endDate));
  const byTime = <T extends { allDay: boolean; startDate: string }>(a: T, b: T) =>
    a.allDay === b.allDay ? a.startDate.localeCompare(b.startDate) : a.allDay ? -1 : 1;
  // 칸에 제목 막대로 보여줄 항목 — 개인 일정 먼저, 그다음 담당 업무
  const barsFor = (day: string) => [
    ...events.filter((e) => covers(e, day)).sort(byTime).map((e) => ({ id: e.id, title: e.title, color: PERSONAL_COLOR })),
    ...tasks.filter((t) => covers(t, day)).sort(byTime).map((t) => ({ id: `t:${t.id}`, title: t.title, color: taskColor(t) })),
  ];
  const dayEvents = events.filter((e) => covers(e, selected)).sort(byTime);
  const dayTasks = tasks.filter((t) => covers(t, selected)).sort(byTime);
  const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`;
  const whenText = (x: { allDay: boolean; startDate: string; endDate: string }) => {
    if (x.allDay) {
      const s = ymd(new Date(x.startDate)), e = ymd(new Date(x.endDate));
      return s === e ? "하루 종일" : `하루 종일 · ${md(s)}~${md(e)}`;
    }
    return `${hhmm(x.startDate)}–${hhmm(x.endDate)}`;
  };
  const selDate = new Date(`${selected}T00:00`);
  const selLabel = `${selDate.getMonth() + 1}월 ${selDate.getDate()}일 ${WEEKDAYS_KO[selDate.getDay()]}요일`;

  return (
    <div className="card mcal-card">
      <div className="mc-grid mc-week">
        {WEEKDAYS_KO.map((w, i) => (
          <span key={w} className={`mc-wd${i === 0 ? " sun" : i === 6 ? " sat" : ""}`}>{w}</span>
        ))}
      </div>
      <div className="mc-grid">
        {cells.map((c) => {
          const bars = c.inMonth ? barsFor(c.day) : [];
          const isToday = c.day === today;
          const isSel = c.day === selected;
          return (
            <button
              key={c.day}
              className={`mc-day rich${c.inMonth ? "" : " out"}${isToday ? " today" : isSel ? " sel" : ""}`}
              // 이미 선택된 날을 한 번 더 누르면 바로 추가
              onClick={() => (isSel && onAddAt ? onAddAt(c.day) : onSelect(c.day))}
              aria-label={`${c.num}일${bars.length ? ` 일정 ${bars.length}개` : ""}`}
            >
              <span className={`mc-num${c.wd === 0 ? " sun" : c.wd === 6 ? " sat" : ""}`}>{c.num}</span>
              {bars.slice(0, 2).map((b) => (
                <span key={b.id} className="mc-evbar" style={{ background: b.color + "24", color: b.color, borderLeftColor: b.color }}>{b.title}</span>
              ))}
              {bars.length > 2 && <span className="mc-evmore">+{bars.length - 2}</span>}
            </button>
          );
        })}
      </div>
      <div className="mc-agenda">
        <div className="mc-agenda-head">
          {selLabel} {selected === today && <b>오늘</b>}
          {onAddAt && (
            <button type="button" className="mc-add-day" onClick={() => onAddAt(selected)}>+ 이 날 일정 추가</button>
          )}
        </div>
        {dayEvents.length === 0 && dayTasks.length === 0 && (
          <div className="mc-empty">
            이 날짜엔 일정이 없어요.
            {onAddAt && <span className="pc-empty-hint">날짜를 한 번 더 누르면 바로 추가돼요</span>}
          </div>
        )}
        {dayEvents.map((e) => (
          <button key={e.id} className="mc-item mc-item-btn" onClick={() => onEventClick(e)}>
            <span className="mc-bar" style={{ background: PERSONAL_COLOR }} />
            <span className="mc-item-body">
              <span className="mc-item-title">{e.title}</span>
              <span className="mc-item-sub">{whenText(e)}{e.location && ` · ${e.location}`}</span>
            </span>
          </button>
        ))}
        {dayTasks.map((t) => (
          <button key={t.id} className={`mc-item mc-item-btn${t.status === "done" ? " done" : ""}`} onClick={() => onTaskClick(t)}>
            <span className="mc-bar" style={{ background: taskColor(t) }} />
            <span className="mc-item-body">
              <span className="mc-item-title">👤 {t.title}</span>
              <span className="mc-item-sub">담당 업무 · {whenText(t)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── 개인 일정 등록/수정 모달 ── */
type TimeMode = "allDay" | "am" | "pm" | "custom";
const TIME_PRESET: Record<"am" | "pm", [string, string]> = { am: ["09:00", "13:00"], pm: ["13:00", "18:00"] };

function PersonalEventModal({ event, defaultDate, defaultEndDate, prefill, onClose, onSaved }: {
  event?: PEvent; defaultDate: string; defaultEndDate?: string;
  prefill?: QuickParsed | null; // 한 줄 입력에서 '자세히'로 넘어온 값
  onClose: () => void; onSaved: () => void;
}) {
  const confirm = useConfirm();
  const isEdit = !!event;

  const initAllDay = event ? event.allDay : prefill ? prefill.allDay : true;
  const initStart = event && !event.allDay ? hhmm(event.startDate) : prefill && !prefill.allDay ? prefill.startTime : "10:00";
  const initEnd = event && !event.allDay ? hhmm(event.endDate) : prefill && !prefill.allDay ? prefill.endTime : "11:00";
  const initMode: TimeMode = initAllDay ? "allDay"
    : initStart === TIME_PRESET.am[0] && initEnd === TIME_PRESET.am[1] ? "am"
    : initStart === TIME_PRESET.pm[0] && initEnd === TIME_PRESET.pm[1] ? "pm" : "custom";

  const [title, setTitle] = useState(event?.title ?? prefill?.title ?? "");
  const [mode, setMode] = useState<TimeMode>(initMode);
  const [startDate, setStartDate] = useState(event ? ymd(new Date(event.startDate)) : defaultDate);
  const [endDate, setEndDate] = useState(event ? ymd(new Date(event.endDate)) : (defaultEndDate || defaultDate));
  const [startTime, setStartTime] = useState(initStart);
  const [endTime, setEndTime] = useState(initEnd);
  const [location, setLocation] = useState(event?.location ?? prefill?.location ?? "");
  const [memo, setMemo] = useState(event?.memo ?? "");
  const [showExtra, setShowExtra] = useState(!!(event?.location || event?.memo || prefill?.location)); // 장소·메모 펼침
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // 새 일정은 제목에 바로 포커스 — 터치 기기는 키보드가 시트를 가리므로 제외
  useEffect(() => {
    if (!isEdit && window.matchMedia("(pointer: fine)").matches) titleRef.current?.focus();
  }, [isEdit]);

  const allDay = mode === "allDay";
  function pickMode(m: TimeMode) {
    setMode(m);
    if (m === "am" || m === "pm") { setStartTime(TIME_PRESET[m][0]); setEndTime(TIME_PRESET[m][1]); }
  }
  // 시작 시각을 바꾸면 길이를 유지한 채 종료 시각도 같이 이동
  function changeStartTime(v: string) {
    if (!v) { setStartTime(v); return; }
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const dur = Math.max(30, toMin(endTime) - toMin(startTime));
    const end = Math.min(toMin(v) + dur, 23 * 60 + 59);
    setStartTime(v);
    setEndTime(`${pad2(Math.floor(end / 60))}:${pad2(end % 60)}`);
  }
  // 시작일을 바꾸면 기간 길이를 유지한 채 종료일도 같이 이동
  function changeStartDate(v: string) {
    if (!v) { setStartDate(v); return; }
    const span = startDate && endDate
      ? Math.max(0, Math.round((new Date(`${endDate}T00:00`).getTime() - new Date(`${startDate}T00:00`).getTime()) / 86_400_000))
      : 0;
    setStartDate(v);
    setEndDate(addDays(v, span));
  }

  const today = ymd(new Date());
  const quickDays = [
    { label: "오늘", day: today },
    { label: "내일", day: addDays(today, 1) },
    { label: "모레", day: addDays(today, 2) },
  ];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!title.trim()) { setErr("제목을 입력하세요."); titleRef.current?.focus(); return; }
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
        body: JSON.stringify({ title: title.trim(), location, memo, ...when }),
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
      <div className="modal pe-modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>{isEdit ? "개인 일정 수정" : "개인 일정 추가"}</h2>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="pe-title">제목</label>
            <input
              id="pe-title" ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 병원 예약" maxLength={120} enterKeyHint="done"
            />
          </div>

          <div className="field">
            <label>시간</label>
            <div className="seg pe-seg" role="radiogroup" aria-label="시간">
              {([["allDay", "하루 종일"], ["am", "오전"], ["pm", "오후"], ["custom", "시간 지정"]] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? "on" : ""} onClick={() => pickMode(k)}>{l}</button>
              ))}
            </div>
            {(mode === "am" || mode === "pm") && (
              <p className="pe-hint">{startTime} ~ {endTime} · 다른 시간은 &lsquo;시간 지정&rsquo;</p>
            )}
          </div>

          {allDay ? (
            <div className="form-grid-2 pe-dates">
              <div className="field"><label htmlFor="pe-sd">시작일</label><input id="pe-sd" type="date" value={startDate} onChange={(e) => changeStartDate(e.target.value)} required /></div>
              <div className="field"><label htmlFor="pe-ed">종료일</label><input id="pe-ed" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required /></div>
            </div>
          ) : (
            <>
              <div className="field"><label htmlFor="pe-d">날짜</label><input id="pe-d" type="date" value={startDate} onChange={(e) => changeStartDate(e.target.value)} required /></div>
              {mode === "custom" && (
                <div className="form-grid-2 pe-dates">
                  <div className="field"><label htmlFor="pe-st">시작 시각</label><input id="pe-st" type="time" value={startTime} onChange={(e) => changeStartTime(e.target.value)} required /></div>
                  <div className="field"><label htmlFor="pe-et">종료 시각</label><input id="pe-et" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required /></div>
                </div>
              )}
            </>
          )}
          <div className="pe-chips pe-days">
            {quickDays.map((q) => (
              <button
                key={q.label} type="button"
                className={`chip chip-btn${startDate === q.day && (!allDay || endDate === q.day) ? " sel" : ""}`}
                onClick={() => { setStartDate(q.day); setEndDate(q.day); }}
              >{q.label}</button>
            ))}
          </div>

          {showExtra ? (
            <>
              <div className="field">
                <label htmlFor="pe-loc">장소 (선택)</label>
                <input id="pe-loc" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} />
              </div>
              <div className="field">
                <label htmlFor="pe-memo">메모 (선택)</label>
                <textarea id="pe-memo" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={1000} />
              </div>
            </>
          ) : (
            <button type="button" className="pe-more" onClick={() => setShowExtra(true)}>+ 장소·메모 추가</button>
          )}

          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions pe-actions">
            {isEdit && (
              <button type="button" className="btn btn-danger" disabled={busy} onClick={remove}>삭제</button>
            )}
            <button className="btn btn-primary pe-save" disabled={busy}>{busy ? "저장 중…" : isEdit ? "저장" : "등록"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
