"use client";
import { ModalClose } from "@/components/ModalClose";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import koLocale from "@fullcalendar/core/locales/ko";
import { Icon } from "@/components/icons";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAutoRefresh } from "@/components/useAutoRefresh";

type TeamInfo = { id: string; name: string; slug: string; color: string };
type TeamRef = { id: string; name: string; color: string };
type CategoryInfo = { id: string; name: string; color: string };
type TaskItem = {
  id: string;
  title: string;
  description: string;
  teams: TeamRef[];
  category: CategoryInfo | null;
  assignees: { id: string; name: string }[];
  createdBy: { id: string; name: string } | null;
  startDate: string;
  endDate: string;
  allDay: boolean;
  status: "todo" | "in_progress" | "done" | "hold";
  priority: string;
  location: string;
  recurrenceId?: string | null;
  resources?: { id: string; name: string; ownerId?: string; ownerName?: string }[]; // 연동된 대여 장비 (+장비별 담당자)
};

type ResourceOpt = { id: string; name: string; category: { id: string; name: string; color?: string; order?: number } | null };

const STATUS_LABEL: Record<string, [string, string]> = {
  todo: ["예정", "var(--st-todo)"],
  in_progress: ["진행중", "var(--st-prog)"],
  done: ["완료", "var(--st-done)"],
  hold: ["보류", "var(--ink-faint)"],
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "낮음", normal: "보통", high: "높음", urgent: "긴급",
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymdStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
// 일정 대표색 — 카테고리 색 우선, 없으면 첫 팀 색
const taskColor = (t: TaskItem) => t.category?.color ?? t.teams[0]?.color ?? "#8b95a1";
// 우선순위 배지: 높음/긴급만 색상 배지로 강조 (보통/낮음은 숨김)
const PRIORITY_META: Record<string, { label: string; color: string; show: boolean }> = {
  low: { label: "낮음", color: "var(--ink-faint)", show: false },
  normal: { label: "보통", color: "var(--ink-faint)", show: false },
  high: { label: "높음", color: "var(--st-prog)", show: true },
  urgent: { label: "긴급", color: "var(--danger)", show: true },
};

export default function CalendarView({ teams, categories }: { teams: TeamInfo[]; categories: CategoryInfo[] }) {
  const { data: session } = useSession();
  const user = session?.user;
  const calRef = useRef<FullCalendar>(null);

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [visible, setVisible] = useState<Set<string>>(new Set(teams.map((t) => t.id)));
  const [visibleCats, setVisibleCats] = useState<Set<string>>(new Set(categories.map((c) => c.id)));
  const [mineOnly, setMineOnly] = useState(false); // 내가 담당자인 일정만
  const [visibleStatus, setVisibleStatus] = useState<Set<string>>(new Set(["todo", "in_progress", "done", "hold"]));
  const [filtersOpen, setFiltersOpen] = useState(false); // 필터 패널 접기/펼치기
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState("");
  const [detail, setDetail] = useState<TaskItem | null>(null);
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [curStart, setCurStart] = useState<Date | null>(null); // 현재 뷰의 기준 날짜 (큰 타이포 헤더용)
  const [view, setView] = useState("dayGridMonth");
  const [maxEvents, setMaxEvents] = useState(4); // 하루 표시 최대 개수 (초과 시 +N개)
  const [isMobile, setIsMobile] = useState(false);
  const [mSel, setMSel] = useState(() => ymdStr(new Date())); // 모바일 월간 뷰: 선택한 날짜

  // 화면 크기에 따라 하루 표시 개수·시간표시 조절 (셀 높이 고정과 맞춤)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => { setMaxEvents(mq.matches ? 2 : 4); setIsMobile(mq.matches); };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // 검색 딥링크: /calendar?task=<id> → 상세 모달 열고 해당 날짜로 이동
  const searchParams = useSearchParams();
  const deepTaskId = searchParams.get("task");
  useEffect(() => {
    if (!deepTaskId) return;
    let alive = true;
    fetch(`/api/tasks/${deepTaskId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.task) return;
        setDetail(d.task);
        api()?.gotoDate(d.task.startDate);
      })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepTaskId]);

  const api = () => calRef.current?.getApi();
  function changeView(v: string) {
    setView(v);
    api()?.changeView(v);
    // 모바일 월간(커스텀 그리드) 동안 FullCalendar가 display:none이라 크기 0 → 다시 보일 때 재계산
    setTimeout(() => api()?.updateSize(), 60);
  }

  // 모바일 월간: 달을 넘기면 선택일을 그 달로 보정 (오늘이 있으면 오늘, 없으면 1일)
  useEffect(() => {
    if (!curStart) return;
    const mk = `${curStart.getFullYear()}-${pad2(curStart.getMonth() + 1)}`;
    if (!mSel.startsWith(mk)) {
      const today = ymdStr(new Date());
      setMSel(today.startsWith(mk) ? today : `${mk}-01`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curStart]);

  // 권한 (프론트 표시용, 실제 검증은 API에서 2중으로)
  const isOrgEditor = ["admin", "manager", "deputy", "secretary"].includes(user?.role ?? "");
  const canEditOwnTeam = user?.role === "leader" || user?.role === "vice_leader";
  const isTeamMember = ["leader", "vice_leader", "member"].includes(user?.role ?? "");
  // 일정 등록 가능한 팀 — 팀원 포함 (소속 팀이면 등록 가능)
  const editableTeams = useMemo(() => {
    if (!user) return [];
    if (isOrgEditor) return teams;
    if (isTeamMember && user.teamId) return teams.filter((t) => t.id === user.teamId);
    return [];
  }, [teams, user, isOrgEditor, isTeamMember]);

  const fetchTasks = useCallback(async (from: string, to: string) => {
    const res = await fetch(`/api/tasks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (res.ok) {
      const data = await res.json();
      setTasks(data.tasks ?? []);
    }
  }, []);

  const refetch = useCallback(() => {
    if (range) fetchTasks(range.from, range.to);
  }, [range, fetchTasks]);
  useAutoRefresh(refetch, ["task"]); // 다른 사람이 등록·수정해도 새로고침 없이 반영

  // 필터 적용된 일정 — FullCalendar 이벤트와 모바일 월간 그리드가 공유
  const filteredTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.teams.some((tm) => visible.has(tm.id)))
        .filter((t) => !t.category || visibleCats.has(t.category.id))
        .filter((t) => visibleStatus.has(t.status))
        .filter((t) => !mineOnly || t.assignees.some((a) => a.id === user?.id)),
    [tasks, visible, visibleCats, visibleStatus, mineOnly, user?.id]
  );

  // 이 업무를 수정(드래그 이동)할 수 있는지 — 상세 모달과 동일 규칙 (실제 검증은 API에서)
  const canEditTask = useCallback(
    (t: TaskItem) =>
      isOrgEditor ||
      (canEditOwnTeam && !!user?.teamId && t.teams.some((tm) => tm.id === user.teamId)) ||
      (!!user?.id && t.createdBy?.id === user.id), // 본인이 만든 일정
    [isOrgEditor, canEditOwnTeam, user?.teamId, user?.id]
  );

  const events = useMemo(
    () =>
      filteredTasks
        .map((t) => {
          // allDay 이벤트의 end는 exclusive → 하루 더해 표시
          let end = t.endDate;
          if (t.allDay) {
            const d = new Date(t.endDate);
            d.setDate(d.getDate() + 1);
            end = d.toISOString();
          }
          // 색상: 카테고리 색 우선, 없으면 팀 색 폴백
          const primary = t.teams.find((tm) => visible.has(tm.id)) ?? t.teams[0];
          const color = t.category?.color ?? primary?.color ?? "#8b95a1";
          return {
            id: t.id,
            title: t.title,
            start: t.startDate,
            end,
            allDay: t.allDay,
            backgroundColor: color + "26",
            borderColor: color, // 월간 도트·리스트 뷰의 점 색상
            textColor: color,
            classNames: t.status === "done" ? ["ev-done"] : [],
            editable: canEditTask(t), // 권한 있는 일정만 드래그 이동·리사이즈
            extendedProps: { taskId: t.id, urgent: t.priority === "urgent", done: t.status === "done" },
          };
        }),
    [filteredTasks, visible, canEditTask]
  );

  // 드래그 이동/리사이즈 → 기간 PATCH (실패 시 원위치)
  async function onEventMove(arg: { event: any; revert: () => void }) {
    const ev = arg.event;
    const taskId = ev.extendedProps.taskId as string;
    let startDate: string, endDate: string;
    if (ev.allDay) {
      const s: Date = ev.start;
      // FullCalendar의 allDay end는 exclusive → inclusive로 하루 빼서 저장
      const e = ev.end ? new Date(ev.end.getTime() - 86_400_000) : s;
      startDate = ymdStr(s);
      endDate = ymdStr(e < s ? s : e);
    } else {
      startDate = ev.start.toISOString();
      endDate = (ev.end ?? new Date(ev.start.getTime() + 3_600_000)).toISOString();
    }
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, allDay: ev.allDay }),
    });
    if (!res.ok) { arg.revert(); return; }
    refetch();
  }

  function toggleStatus(id: string) {
    setVisibleStatus((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCat(id: string) {
    setVisibleCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTeam(id: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 필터가 기본(전체 표시)에서 벗어났는지 → 버튼에 활성 표시
  const filtersActive =
    mineOnly ||
    visible.size !== teams.length ||
    visibleCats.size !== categories.length ||
    visibleStatus.size !== 4;

  function resetFilters() {
    setVisible(new Set(teams.map((t) => t.id)));
    setVisibleCats(new Set(categories.map((c) => c.id)));
    setVisibleStatus(new Set(["todo", "in_progress", "done", "hold"]));
    setMineOnly(false);
  }

  // 큰 타이포 헤더 — "7월" + "2026" (일 뷰는 "7월 10일")
  const bigLabel = curStart
    ? view === "timeGridDay"
      ? `${curStart.getMonth() + 1}월 ${curStart.getDate()}일`
      : `${curStart.getMonth() + 1}월`
    : "";
  const yearLabel = curStart ? String(curStart.getFullYear()) : "";

  return (
    <div className="cal-wrap">
      {/* 풀블리드 헤더 — 큰 월 타이포 + 원형 화살표 (1c) */}
      <div className="cal-toolbar cal1c-head">
        <h2 className="cal1c-month">{bigLabel}</h2>
        <span className="cal1c-year">{yearLabel}</span>
        <div className="cal1c-nav">
          <button className="cal1c-arrow" aria-label="이전" onClick={() => api()?.prev()}>
            <Icon name="chevronL" size={15} />
          </button>
          <button className="cal1c-arrow" aria-label="다음" onClick={() => api()?.next()}>
            <Icon name="chevronR" size={15} />
          </button>
        </div>
        <button className="cal1c-today" onClick={() => api()?.today()}>오늘</button>
        <button
          className={`cal1c-today cal-filter-btn${filtersOpen ? " open" : ""}`}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Icon name="filter" size={13} /> 필터
          {filtersActive && <span className="cal-filter-dot" aria-label="필터 적용됨" />}
        </button>
        <div className="cal-spacer" />
        <div className="seg" role="tablist" aria-label="보기 전환">
          <button className={view === "dayGridMonth" ? "on" : ""} onClick={() => changeView("dayGridMonth")}>월</button>
          <button className={view === "timeGridWeek" ? "on" : ""} onClick={() => changeView("timeGridWeek")}>주</button>
          <button className={view === "timeGridDay" ? "on" : ""} onClick={() => changeView("timeGridDay")}>일</button>
          <button className={view === "listMonth" ? "on" : ""} onClick={() => changeView("listMonth")}>목록</button>
        </div>
        {editableTeams.length > 0 && (
          <button
            className="cal1c-add"
            onClick={() => {
              setCreateDate(new Date().toISOString().slice(0, 10));
              setCreateOpen(true);
            }}
          >
            <Icon name="plus" size={15} strokeWidth={2.6} /> <span>업무 추가</span>
          </button>
        )}
      </div>

      {/* 필터 — 기본 접힘, '필터' 버튼으로 펼침 (팀·분류·상태) */}
      {filtersOpen && (
        <div className="filter-panel">
          <div className="filter-row">
            <span className="filter-label">팀</span>
            {teams.map((t) => (
              <button
                key={t.id}
                className="chip chip-btn"
                style={{ opacity: visible.has(t.id) ? 1 : 0.4 }}
                onClick={() => toggleTeam(t.id)}
              >
                <span className="dot" style={{ background: t.color }} />
                {t.name}
              </button>
            ))}
          </div>
          {categories.length > 0 && (
            <div className="filter-row">
              <span className="filter-label">분류</span>
              {categories.map((c) => (
                <button
                  key={c.id}
                  className="chip chip-btn"
                  style={{ opacity: visibleCats.has(c.id) ? 1 : 0.4 }}
                  onClick={() => toggleCat(c.id)}
                >
                  <span className="dot" style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="filter-row">
            <span className="filter-label">상태</span>
            <button
              className={`chip chip-btn${mineOnly ? " sel" : ""}`}
              onClick={() => setMineOnly((v) => !v)}
            >
              <Icon name="userLine" size={13} /> 내 일정만
            </button>
            <span className="filter-divider" />
            {Object.entries(STATUS_LABEL).map(([key, [label, color]]) => (
              <button
                key={key}
                className="chip chip-btn"
                style={{ opacity: visibleStatus.has(key) ? 1 : 0.4 }}
                onClick={() => toggleStatus(key)}
              >
                <span className="dot" style={{ background: color }} />
                {label}
              </button>
            ))}
            {filtersActive && (
              <button className="filter-reset" onClick={resetFilters}>전체 초기화</button>
            )}
          </div>
        </div>
      )}

      {/* 모바일 월간: 도트 그리드 + 선택일 아젠다 (1d) — FullCalendar는 숨기고 API(월 이동·조회)만 사용 */}
      {isMobile && view === "dayGridMonth" && curStart && (
        <MobileMonthCal
          monthDate={curStart}
          tasks={filteredTasks}
          selected={mSel}
          onSelect={setMSel}
          onTaskClick={setDetail}
        />
      )}

      <div className="card cal-card" style={{ padding: 14, marginTop: 14, display: isMobile && view === "dayGridMonth" ? "none" : undefined }}>
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={koLocale}
          height="auto"
          headerToolbar={false}
          dayCellContent={(arg) => (arg.view.type === "dayGridMonth" ? String(arg.date.getDate()) : undefined)}
          views={{
            timeGridWeek: { dayHeaderFormat: { weekday: "short", day: "numeric" } },
            timeGridDay: { dayHeaderFormat: { weekday: "short", day: "numeric" } },
          }}
          noEventsContent="이 기간에 등록된 업무가 없습니다"
          dayMaxEvents={maxEvents}
          fixedWeekCount={false}
          moreLinkContent={(arg) => `+${arg.num}개`}
          eventDisplay="block"
          displayEventTime={!isMobile}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          slotMinTime="06:00:00"
          scrollTime="09:00:00"
          allDayText="종일"
          nowIndicator
          eventDrop={onEventMove}
          eventResize={onEventMove}
          events={events}
          eventContent={(arg) => {
            // 월간 뷰: 팀색 칩(틴트 배경 + 왼쪽 컬러바) — 나머지 뷰는 기본 렌더링(true 반환)
            if (arg.view.type !== "dayGridMonth") return true;
            const p = arg.event.extendedProps as { urgent?: boolean; done?: boolean };
            const color = arg.event.borderColor;
            return (
              <span
                className="ev1c"
                style={{
                  background: `color-mix(in srgb, ${color} 13%, transparent)`,
                  borderLeft: `3px solid ${color}`,
                }}
              >
                <span className="ev1c-t" style={{ color }}>{arg.event.title}</span>
                {p.urgent && !p.done && <b className="ev1c-urgent">긴급</b>}
              </span>
            );
          }}
          datesSet={(arg) => {
            setCurStart(arg.view.currentStart);
            setView(arg.view.type);
            setRange({ from: arg.startStr, to: arg.endStr });
            fetchTasks(arg.startStr, arg.endStr);
          }}
          dateClick={(arg) => {
            if (editableTeams.length === 0) return;
            setCreateDate(arg.dateStr.slice(0, 10));
            setCreateOpen(true);
          }}
          eventClick={(arg) => {
            const t = tasks.find((x) => x.id === arg.event.extendedProps.taskId);
            if (t) setDetail(t);
          }}
          eventDidMount={(info) => {
            // 잘려서 안 보이는 일정: 마우스 올리면 전체(시간·제목·장소) 툴팁
            const t = tasks.find((x) => x.id === info.event.extendedProps.taskId);
            const time = info.timeText ? `${info.timeText} ` : "";
            const place = t?.location ? ` · ${t.location}` : "";
            info.el.setAttribute("title", `${time}${info.event.title}${place}`);
          }}
        />
      </div>

      {createOpen && (
        <TaskFormModal
          teams={editableTeams}
          categories={categories}
          defaultDate={createDate}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            refetch();
          }}
        />
      )}

      {editing && (
        <TaskFormModal
          teams={editableTeams}
          categories={categories}
          defaultDate={createDate}
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}

      {detail && (
        <TaskDetailModal
          task={detail}
          onClose={() => setDetail(null)}
          onEdit={(t) => { setDetail(null); setEditing(t); }}
          onChanged={() => {
            setDetail(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

/* ── 모바일 월간 뷰 — 도트 그리드 + 선택일 아젠다 (1d) ── */
function MobileMonthCal({ monthDate, tasks, selected, onSelect, onTaskClick }: {
  monthDate: Date; tasks: TaskItem[]; selected: string;
  onSelect: (day: string) => void; onTaskClick: (t: TaskItem) => void;
}) {
  const today = ymdStr(new Date());
  const y = monthDate.getFullYear(), m = monthDate.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const offset = new Date(y, m, 1).getDay();
  const total = Math.ceil((offset + days) / 7) * 7;
  const cells = Array.from({ length: total }, (_, i) => {
    const d = new Date(y, m, i - offset + 1);
    return { day: ymdStr(d), num: d.getDate(), inMonth: d.getMonth() === m, wd: d.getDay() };
  });

  // 업무가 해당 날짜에 걸치는지 (allDay end는 inclusive)
  const covers = (t: TaskItem, day: string) => ymdStr(new Date(t.startDate)) <= day && day <= ymdStr(new Date(t.endDate));
  const dotsFor = (day: string) => {
    const colors: string[] = [];
    for (const t of tasks) {
      if (!covers(t, day)) continue;
      const c = taskColor(t);
      if (!colors.includes(c)) colors.push(c);
      if (colors.length >= 3) break;
    }
    return colors;
  };

  const fmtT = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const dayTasks = tasks.filter((t) => covers(t, selected))
    .sort((a, b) => (a.allDay === b.allDay ? a.startDate.localeCompare(b.startDate) : a.allDay ? -1 : 1));
  const selDate = new Date(selected);
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
          const dots = c.inMonth ? dotsFor(c.day) : [];
          const isToday = c.day === today;
          const isSel = c.day === selected;
          return (
            <button
              key={c.day}
              className={`mc-day${c.inMonth ? "" : " out"}${isToday ? " today" : isSel ? " sel" : ""}`}
              onClick={() => onSelect(c.day)}
            >
              <span className={`mc-num${c.wd === 0 ? " sun" : c.wd === 6 ? " sat" : ""}`}>{c.num}</span>
              <span className="mc-dots">
                {dots.map((color) => <i key={color} style={{ background: color }} />)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mc-agenda">
        <div className="mc-agenda-head">
          {selLabel} {selected === today && <b>오늘</b>}
        </div>
        {dayTasks.length === 0 && (
          <div className="mc-empty">이 날짜엔 일정이 없어요.</div>
        )}
        {dayTasks.map((t) => {
          const [stLabel] = STATUS_LABEL[t.status] ?? STATUS_LABEL.todo;
          return (
            <button key={t.id} className={`mc-item mc-item-btn${t.status === "done" ? " done" : ""}`} onClick={() => onTaskClick(t)}>
              <span className="mc-bar" style={{ background: taskColor(t) }} />
              <span className="mc-item-body">
                <span className="mc-item-title">
                  {t.title}
                  {t.priority === "urgent" && t.status !== "done" && <b className="ev1c-urgent" style={{ marginLeft: 5 }}>긴급</b>}
                </span>
                <span className="mc-item-sub">
                  {t.allDay ? "하루 종일" : `${fmtT(t.startDate)}–${fmtT(t.endDate)}`}
                  {t.teams.length > 0 && ` · ${t.teams.map((tm) => tm.name).join("·")}`}
                  {t.location && ` · ${t.location}`}
                </span>
              </span>
              <span className={`wbadge${t.status === "in_progress" ? " prog" : t.status === "done" ? " done" : ""}`}>{stLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── 업무 추가/수정 모달 (겸용) ── */
function TaskFormModal({
  teams, categories, defaultDate, task, onClose, onSaved,
}: {
  teams: TeamInfo[]; categories: CategoryInfo[]; defaultDate: string; task?: TaskItem | null; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!task;
  const pad = (n: number) => String(n).padStart(2, "0");
  const toDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const toTime = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const [title, setTitle] = useState(task?.title ?? "");
  const [teamIds, setTeamIds] = useState<string[]>(
    task ? task.teams.map((t) => t.id).filter((id) => teams.some((tm) => tm.id === id)) : (teams[0] ? [teams[0].id] : [])
  );
  const [allDay, setAllDay] = useState(task ? task.allDay : true);
  const [startDate, setStartDate] = useState(task ? toDate(task.startDate) : defaultDate);
  const [endDate, setEndDate] = useState(task ? toDate(task.endDate) : defaultDate);
  const [startTime, setStartTime] = useState(task && !task.allDay ? toTime(task.startDate) : "10:00");
  const [endTime, setEndTime] = useState(task && !task.allDay ? toTime(task.endDate) : "11:00");
  const [priority, setPriority] = useState(task?.priority ?? "normal");
  const [categoryId, setCategoryId] = useState(task?.category?.id ?? "");
  const [location, setLocation] = useState(task?.location ?? "");
  const [repeat, setRepeat] = useState("none"); // 반복 — 생성 시에만
  const [repeatUntil, setRepeatUntil] = useState("");
  const [allResources, setAllResources] = useState<ResourceOpt[]>([]);
  const [resourceIds, setResourceIds] = useState<string[]>(task?.resources?.map((r) => r.id) ?? []);
  // 장비별 담당자 (resourceId → userId) — 그 사람 이름으로 예약이 잡혀 반납 책임이 감
  const [resourceOwners, setResourceOwners] = useState<Record<string, string>>(
    () => Object.fromEntries((task?.resources ?? []).filter((r) => r.ownerId).map((r) => [r.id, r.ownerId!]))
  );
  const [equipQuery, setEquipQuery] = useState("");
  const [equipTab, setEquipTab] = useState(""); // "" = 전체, 그 외 = 분류 id

  // 탭 목록 — 등록된 장비가 있는 분류만 (분류 순서대로)
  const equipTabs = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string; order: number }>();
    for (const r of allResources) {
      const key = r.category?.id ?? "__none";
      if (!map.has(key)) {
        map.set(key, { id: key, name: r.category?.name ?? "미분류", color: r.category?.color ?? "#8b95a1", order: r.category?.order ?? 999 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [allResources]);

  // 탭 + 검색어 필터 → 분류별 그룹 (분류 순서 → 이름순)
  const equipGroups = useMemo(() => {
    const q = equipQuery.trim().toLowerCase();
    let filtered = q ? allResources.filter((r) => r.name.toLowerCase().includes(q)) : allResources;
    if (equipTab) filtered = filtered.filter((r) => (r.category?.id ?? "__none") === equipTab);
    const map = new Map<string, { name: string; color: string; order: number; items: ResourceOpt[] }>();
    for (const r of filtered) {
      const key = r.category?.id ?? "__none";
      if (!map.has(key)) {
        map.set(key, {
          name: r.category?.name ?? "미분류",
          color: r.category?.color ?? "#8b95a1",
          order: r.category?.order ?? 999,
          items: [],
        });
      }
      map.get(key)!.items.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [allResources, equipQuery, equipTab]);

  const selectedResources = useMemo(
    () => allResources.filter((r) => resourceIds.includes(r.id)),
    [allResources, resourceIds]
  );

  // 대여 장비 목록 로드 (활성 자원)
  useEffect(() => {
    fetch("/api/resources")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.resources) setAllResources(d.resources); })
      .catch(() => {});
  }, []);

  function toggleResource(id: string) {
    setResourceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    // 선택 해제 시 담당자 매핑도 제거
    setResourceOwners((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }
  const [description, setDescription] = useState(task?.description ?? "");
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [assignees, setAssignees] = useState<Set<string>>(new Set(task ? task.assignees.map((a) => a.id) : []));
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // 선택된 팀들의 담당 후보(멤버) union 로드
  const loadMembers = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setMembers([]); return; }
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/users?team=${id}`).then((r) => (r.ok ? r.json() : { users: [] })).catch(() => ({ users: [] }))
      )
    );
    const map = new Map<string, { id: string; name: string }>();
    results.forEach((r) => (r.users ?? []).forEach((u: any) => map.set(u.id, { id: u.id, name: u.name })));
    setMembers(Array.from(map.values()));
  }, []);

  useEffect(() => { loadMembers(teamIds); }, [teamIds, loadMembers]);

  function toggleTeam(id: string) {
    setTeamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleAssignee(id: string) {
    setAssignees((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (teamIds.length === 0) { setErr("팀을 하나 이상 선택하세요."); return; }
    setLoading(true);
    // 시간 지정 업무는 브라우저 로컬시각을 ISO(UTC)로 변환해 전송 → 서버 타임존과 무관하게 정확
    const when = allDay
      ? { startDate, endDate, allDay: true }
      : {
          startDate: new Date(`${startDate}T${startTime}`).toISOString(),
          endDate: new Date(`${startDate}T${endTime}`).toISOString(),
          allDay: false,
        };
    const res = await fetch(isEdit ? `/api/tasks/${task!.id}` : "/api/tasks", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, teamIds, categoryId: categoryId || null, assignees: Array.from(assignees),
        priority, location, description, ...when,
        resourceIds: repeat !== "none" ? [] : resourceIds,
        // 장비별 담당자 — 선택된 장비 + 현재 담당자로 지정된 사람만 전송
        resourceOwners: repeat !== "none" ? undefined : Object.fromEntries(
          Object.entries(resourceOwners).filter(([rid, uid]) => resourceIds.includes(rid) && assignees.has(uid))
        ),
        ...(isEdit ? {} : { repeat, repeatUntil: repeat !== "none" && repeatUntil ? repeatUntil : undefined }),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error ?? (isEdit ? "수정에 실패했습니다." : "등록에 실패했습니다.")); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>{isEdit ? "업무 수정" : "업무 추가"}</h2>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>제목</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 홍보영상 본 촬영" required />
          </div>

          <div className="field">
            <label>팀 · 여러 팀 선택 가능</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {teams.map((t) => (
                <button
                  type="button" key={t.id}
                  className={`chip chip-btn${teamIds.includes(t.id) ? " sel" : ""}`}
                  onClick={() => toggleTeam(t.id)}
                >
                  <span className="dot" style={{ background: t.color }} />{t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="switch-row">
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-soft)" }}>하루 종일</span>
              <button
                type="button"
                role="switch"
                aria-checked={allDay}
                aria-label="하루 종일"
                className={`toggle${allDay ? " on" : ""}`}
                onClick={() => setAllDay(!allDay)}
              >
                <span className="toggle-knob" />
              </button>
            </div>
          </div>

          {allDay ? (
            <div className="form-grid-2">
              <div className="field">
                <label>시작일</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div className="field">
                <label>종료일</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              </div>
            </div>
          ) : (
            <>
              <div className="field">
                <label>날짜</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div className="form-grid-2">
                <div className="field">
                  <label>시작 시각</label>
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                </div>
                <div className="field">
                  <label>종료 시각</label>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
                </div>
              </div>
            </>
          )}

          {!isEdit && (
            <div className="form-grid-2">
              <div className="field">
                <label>반복</label>
                <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
                  <option value="none">반복 없음</option>
                  <option value="daily">매일</option>
                  <option value="weekly">매주</option>
                  <option value="biweekly">격주</option>
                  <option value="monthly">매월</option>
                </select>
              </div>
              {repeat !== "none" && (
                <div className="field">
                  <label>반복 종료일 (기본 3개월)</label>
                  <input type="date" value={repeatUntil} min={startDate} onChange={(e) => setRepeatUntil(e.target.value)} />
                </div>
              )}
            </div>
          )}

          <div className="form-grid-2">
            <div className="field">
              <label>우선순위</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">낮음</option>
                <option value="normal">보통</option>
                <option value="high">높음</option>
                <option value="urgent">긴급</option>
              </select>
            </div>
            <div className="field">
              <label>카테고리</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">없음</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {members.length > 0 && (
            <div className="field">
              <label>담당자</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {members.map((m) => (
                  <button
                    type="button" key={m.id}
                    className={`chip chip-btn${assignees.has(m.id) ? " sel" : ""}`}
                    onClick={() => toggleAssignee(m.id)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {allResources.length > 0 && (
            <div className="field">
              <label>대여 장비 (선택) · 선택하면 이 시간에 자원 예약이 함께 잡혀요</label>
              {repeat !== "none" ? (
                <p className="equip-hint">반복 일정에는 장비 예약을 함께 설정할 수 없어요.</p>
              ) : (
                <div className="equip-box">
                  {selectedResources.length > 0 && (() => {
                    // 장비별 담당자 후보 = 이 일정의 담당자로 지정된 사람들
                    const ownerOpts = members.filter((mem) => assignees.has(mem.id));
                    return (
                      <div className="equip-selected">
                        {selectedResources.map((r) => (
                          <div className="equip-sel-row" key={r.id}>
                            <button type="button" className="equip-tag" onClick={() => toggleResource(r.id)}>
                              {r.name} <span aria-hidden>✕</span>
                            </button>
                            {ownerOpts.length > 0 && (
                              <select
                                className="equip-owner"
                                value={resourceOwners[r.id] ?? ""}
                                onChange={(e) => setResourceOwners((prev) => {
                                  const next = { ...prev };
                                  if (e.target.value) next[r.id] = e.target.value;
                                  else delete next[r.id];
                                  return next;
                                })}
                                aria-label={`${r.name} 담당자`}
                              >
                                <option value="">담당자 (기본: 등록자)</option>
                                {ownerOpts.map((mem) => <option key={mem.id} value={mem.id}>{mem.name}</option>)}
                              </select>
                            )}
                          </div>
                        ))}
                        {ownerOpts.length > 0 && (
                          <p className="equip-hint" style={{ padding: "2px 2px 0" }}>
                            장비마다 담당자를 정하면 그 사람 이름으로 예약돼요 (반납 책임)
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  <div className="equip-search">
                    <Icon name="search" size={15} />
                    <input
                      value={equipQuery}
                      onChange={(e) => setEquipQuery(e.target.value)}
                      placeholder="장비 이름 검색"
                      aria-label="장비 검색"
                    />
                    {equipQuery && (
                      <button type="button" className="equip-clear" onClick={() => setEquipQuery("")} aria-label="검색 지우기">✕</button>
                    )}
                  </div>
                  {equipTabs.length > 1 && (
                    <div className="equip-tabs" role="tablist" aria-label="장비 분류">
                      <button
                        type="button" role="tab" aria-selected={equipTab === ""}
                        className={`equip-tab${equipTab === "" ? " on" : ""}`}
                        onClick={() => setEquipTab("")}
                      >
                        전체
                      </button>
                      {equipTabs.map((t) => (
                        <button
                          type="button" role="tab" key={t.id} aria-selected={equipTab === t.id}
                          className={`equip-tab${equipTab === t.id ? " on" : ""}`}
                          onClick={() => setEquipTab(t.id)}
                        >
                          <span className="dot" style={{ background: t.color }} />
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="equip-list">
                    {equipGroups.length === 0 && <p className="equip-hint" style={{ padding: "14px 12px" }}>“{equipQuery}” 검색 결과가 없어요.</p>}
                    {equipGroups.map((g) => (
                      <div key={g.name}>
                        <div className="equip-group">
                          <span className="dot" style={{ background: g.color }} />
                          {g.name}
                          <span className="equip-group-n">{g.items.length}</span>
                        </div>
                        {g.items.map((r) => {
                          const on = resourceIds.includes(r.id);
                          return (
                            <button type="button" key={r.id} className={`equip-row${on ? " on" : ""}`} onClick={() => toggleResource(r.id)}>
                              <span className="equip-check" aria-hidden>
                                {on && <Icon name="check" size={12} strokeWidth={3} />}
                              </span>
                              {r.name}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="field">
            <label>장소 (선택)</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예: 성수 스튜디오 B" />
          </div>
          <div className="field">
            <label>상세 내용 (선택)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={loading}>
              {loading ? "저장 중…" : isEdit ? "저장" : "등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── 업무 상세 모달 ── */
function TaskDetailModal({
  task, onClose, onChanged, onEdit,
}: {
  task: TaskItem; onClose: () => void; onChanged: () => void; onEdit: (t: TaskItem) => void;
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const confirm = useConfirm();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<{ id: string; author: { id: string; name: string } | null; content: string; createdAt: string }[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/tasks/${task.id}/comments`);
    if (res.ok) setComments((await res.json()).comments ?? []);
  }, [task.id]);
  useEffect(() => { loadComments(); }, [loadComments]);

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    setCommentBusy(true);
    const res = await fetch(`/api/tasks/${task.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    setCommentBusy(false);
    if (res.ok) { setCommentText(""); loadComments(); }
  }

  const teamIds = task.teams.map((t) => t.id);
  const role = user?.role;
  const isOrgEditor = ["admin", "manager", "deputy", "secretary"].includes(role ?? "");
  const inTaskTeam = user?.teamId != null && teamIds.includes(user.teamId);
  const isCreator = !!user?.id && task.createdBy?.id === user.id; // 본인이 만든 일정은 수정·삭제 가능
  const canEdit = isOrgEditor || ((role === "leader" || role === "vice_leader") && inTaskTeam) || isCreator;
  const canDelete = role === "admin" || (role === "leader" && inTaskTeam) || isCreator;
  const isAssignee = task.assignees.some((a) => a.id === user?.id);
  const canStatus = canEdit || (role === "member" && inTaskTeam && isAssignee);

  async function setStatus(status: string) {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "변경 실패"); return; }
    onChanged();
  }

  async function remove(scope?: "series") {
    // 전체 반복 삭제는 몇 회차가 지워지는지 먼저 보여준다
    let seriesMsg = "이 반복 일정 전체를 삭제할까요? 모든 반복 회차가 삭제되며 되돌릴 수 없습니다.";
    if (scope === "series") {
      try {
        const r = await fetch(`/api/tasks/${task.id}`);
        const cnt = r.ok ? ((await r.json()).task?.seriesCount ?? 0) : 0;
        if (cnt > 0) seriesMsg = `이 반복 일정 총 ${cnt}회차가 모두 삭제됩니다. 되돌릴 수 없습니다.`;
      } catch { /* 카운트 실패 시 기본 문구 */ }
    }
    const ok = await confirm({
      title: scope === "series" ? "반복 전체 삭제" : "업무 삭제",
      message: scope === "series" ? seriesMsg : "이 업무를 삭제할까요? 삭제하면 되돌릴 수 없습니다.",
      confirmText: "삭제",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/tasks/${task.id}${scope === "series" ? "?scope=series" : ""}`, { method: "DELETE" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "삭제 실패"); return; }
    onChanged();
  }

  const [stLabel, stColor] = STATUS_LABEL[task.status] ?? STATUS_LABEL.todo;
  // 기간 표시: 같은 날은 날짜 1번만, 시간지정이면 시간 범위만 (줄바꿈 최소화)
  const periodLabel = (() => {
    const s = new Date(task.startDate), e = new Date(task.endDate);
    const dateStr = (d: Date) => d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
    const timeStr = (d: Date) => d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    const sameDay = s.toDateString() === e.toDateString();
    if (task.allDay) return sameDay ? dateStr(s) : `${dateStr(s)} ~ ${dateStr(e)}`;
    if (sameDay) return `${dateStr(s)} · ${timeStr(s)} ~ ${timeStr(e)}`;
    return `${dateStr(s)} ${timeStr(s)} ~ ${dateStr(e)} ${timeStr(e)}`;
  })();

  const relTime = (iso: string) => {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "방금";
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}시간 전`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}일 전`;
    return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  };

  const prio = PRIORITY_META[task.priority] ?? PRIORITY_META.normal;

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        {/* 팀 · 카테고리 */}
        <div className="detail-teams">
          {task.teams.map((tm) => (
            <span className="chip" key={tm.id}>
              <span className="dot" style={{ background: tm.color }} />
              {tm.name}
            </span>
          ))}
          {task.category && (
            <span className="chip" style={{ color: task.category.color, borderColor: `color-mix(in srgb, ${task.category.color} 40%, var(--line))` }}>
              # {task.category.name}
            </span>
          )}
        </div>

        {/* 제목 + 배지 */}
        <h2 className="detail-title">{task.title}</h2>
        <div className="detail-badges">
          <span className="badge" style={{ background: `color-mix(in srgb, ${stColor} 14%, transparent)`, color: stColor }}>
            <span className="badge-dot" style={{ background: stColor }} />
            {stLabel}
          </span>
          {prio.show && (
            <span className="badge" style={{ background: `color-mix(in srgb, ${prio.color} 14%, transparent)`, color: prio.color }}>
              {prio.label}
            </span>
          )}
          {task.recurrenceId && (
            <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--primary)" }}>
              반복 일정
            </span>
          )}
        </div>

        {/* 메타 그리드 (시안 스타일) — 값 없는 항목은 숨겨 깔끔하게 */}
        <div className="meta-grid">
          <div className="meta"><div className="k">기간</div><div className="v">{periodLabel}</div></div>
          {task.location && (
            <div className="meta"><div className="k">장소</div><div className="v">{task.location}</div></div>
          )}
          {task.assignees.length > 0 && (
            <div className="meta">
              <div className="k">담당자</div>
              <div className="v">{task.assignees.map((a) => a.name).join(", ")}</div>
            </div>
          )}
          {(task.resources?.length ?? 0) > 0 && (
            <div className="meta">
              <div className="k">대여 장비</div>
              <div className="v">
                {task.resources!.map((r) => r.ownerName ? `${r.name} (${r.ownerName})` : r.name).join(", ")}
              </div>
            </div>
          )}
          <div className="meta"><div className="k">등록자</div><div className="v">{task.createdBy?.name || "—"}</div></div>
        </div>

        {task.description && (
          <>
            <div className="detail-section-label">상세 내용</div>
            <div className="detail-desc">{task.description}</div>
          </>
        )}

        {/* 상태 변경 */}
        {canStatus && (
          <div className="detail-status">
            <div className="detail-status-label">상태 변경</div>
            <div className="seg detail-seg">
              {Object.entries(STATUS_LABEL).map(([key, [label]]) => (
                <button
                  key={key}
                  className={task.status === key ? "on" : ""}
                  disabled={busy}
                  onClick={() => setStatus(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 댓글 */}
        <div className="comments">
          <div className="detail-section-label">댓글 {comments.length > 0 && comments.length}</div>
          {comments.length === 0 && <div className="comment-empty">첫 댓글을 남겨보세요.</div>}
          {comments.map((c) => (
            <div className="comment" key={c.id}>
              <span className="avatar" aria-hidden>{c.author?.name?.slice(0, 1) ?? "?"}</span>
              <div className="c-body">
                <div className="c-h">{c.author?.name ?? "알 수 없음"}<span>{relTime(c.createdAt)}</span></div>
                <p>{c.content}</p>
              </div>
            </div>
          ))}
          <form className="comment-form" onSubmit={addComment}>
            <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="댓글 입력…" maxLength={1000} />
            <button className="btn btn-primary btn-sm" disabled={commentBusy || !commentText.trim()}>등록</button>
          </form>
        </div>

        {err && <p className="err-msg">{err}</p>}
        <div className="detail-actions">
          {canDelete && (
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => remove()}>
              {task.recurrenceId ? "이 일정만 삭제" : "삭제"}
            </button>
          )}
          {canDelete && task.recurrenceId && (
            <button className="btn btn-danger btn-sm" style={{ marginLeft: 6 }} disabled={busy} onClick={() => remove("series")}>
              전체 반복 삭제
            </button>
          )}
          <div className="detail-actions-right">
            {canEdit && (
              <button className="btn btn-ghost btn-sm" onClick={() => onEdit(task)}>수정</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
