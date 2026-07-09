"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import koLocale from "@fullcalendar/core/locales/ko";
import { Icon } from "@/components/icons";

type TeamInfo = { id: string; name: string; slug: string; color: string };
type TeamRef = { id: string; name: string; color: string };
type TaskItem = {
  id: string;
  title: string;
  description: string;
  teams: TeamRef[];
  assignees: { id: string; name: string }[];
  startDate: string;
  endDate: string;
  allDay: boolean;
  status: "todo" | "in_progress" | "done" | "hold";
  priority: string;
  location: string;
};

const STATUS_LABEL: Record<string, [string, string]> = {
  todo: ["예정", "var(--st-todo)"],
  in_progress: ["진행중", "var(--st-prog)"],
  done: ["완료", "var(--st-done)"],
  hold: ["보류", "var(--ink-faint)"],
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "낮음", normal: "보통", high: "높음", urgent: "긴급",
};

export default function CalendarView({ teams }: { teams: TeamInfo[] }) {
  const { data: session } = useSession();
  const user = session?.user;
  const calRef = useRef<FullCalendar>(null);

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [visible, setVisible] = useState<Set<string>>(new Set(teams.map((t) => t.id)));
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState("");
  const [detail, setDetail] = useState<TaskItem | null>(null);
  const [title, setTitle] = useState("");
  const [view, setView] = useState("dayGridMonth");

  const api = () => calRef.current?.getApi();
  function changeView(v: string) {
    setView(v);
    api()?.changeView(v);
  }

  // 권한 (설계 3.2) — 프론트 표시용, 실제 검증은 API에서 2중으로
  const isOrgEditor = ["admin", "manager", "deputy"].includes(user?.orgRole ?? "");
  const editableTeams = useMemo(() => {
    if (!user) return [];
    if (isOrgEditor) return teams;
    return teams.filter((t) =>
      user.teams?.some((m) => m.teamId === t.id && (m.role === "leader" || m.role === "vice_leader"))
    );
  }, [teams, user, isOrgEditor]);

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

  const events = useMemo(
    () =>
      tasks
        .filter((t) => t.teams.some((tm) => visible.has(tm.id)))
        .map((t) => {
          // allDay 이벤트의 end는 exclusive → 하루 더해 표시
          let end = t.endDate;
          if (t.allDay) {
            const d = new Date(t.endDate);
            d.setDate(d.getDate() + 1);
            end = d.toISOString();
          }
          // 색상: 현재 보이는 팀 중 첫 팀 색 (Toss 틴트 배경 + 컬러 텍스트)
          const primary = t.teams.find((tm) => visible.has(tm.id)) ?? t.teams[0];
          const color = primary?.color ?? "#8b95a1";
          return {
            id: t.id,
            title: t.title,
            start: t.startDate,
            end,
            allDay: t.allDay,
            backgroundColor: color + "26",
            textColor: color,
            classNames: t.status === "done" ? ["ev-done"] : [],
            extendedProps: { taskId: t.id },
          };
        }),
    [tasks, visible]
  );

  function toggleTeam(id: string) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {/* 커스텀 Toss 헤더 */}
      <div className="cal-toolbar">
        <button className="cal-arrow" aria-label="이전" onClick={() => api()?.prev()}>
          <Icon name="chevronL" size={18} />
        </button>
        <h2 className="cal-title">{title}</h2>
        <button className="cal-arrow" aria-label="다음" onClick={() => api()?.next()}>
          <Icon name="chevronR" size={18} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => api()?.today()}>오늘</button>
        <div className="cal-spacer" />
        <div className="seg" role="tablist" aria-label="보기 전환">
          <button className={view === "dayGridMonth" ? "on" : ""} onClick={() => changeView("dayGridMonth")}>월</button>
          <button className={view === "timeGridWeek" ? "on" : ""} onClick={() => changeView("timeGridWeek")}>주</button>
          <button className={view === "timeGridDay" ? "on" : ""} onClick={() => changeView("timeGridDay")}>일</button>
        </div>
        {editableTeams.length > 0 && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setCreateDate(new Date().toISOString().slice(0, 10));
              setCreateOpen(true);
            }}
          >
            <Icon name="plus" size={16} strokeWidth={2.4} /> 업무 추가
          </button>
        )}
      </div>

      {/* 팀 필터 칩 */}
      <div className="team-filter">
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

      <div className="card" style={{ padding: 14 }}>
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={koLocale}
          height="auto"
          headerToolbar={false}
          dayCellContent={(arg) => String(arg.date.getDate())}
          events={events}
          datesSet={(arg) => {
            setTitle(arg.view.title);
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
          dayMaxEvents={3}
        />
      </div>

      {createOpen && (
        <TaskCreateModal
          teams={editableTeams}
          defaultDate={createDate}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            refetch();
          }}
        />
      )}

      {detail && (
        <TaskDetailModal
          task={detail}
          onClose={() => setDetail(null)}
          onChanged={() => {
            setDetail(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

/* ── 업무 추가 모달 ── */
function TaskCreateModal({
  teams, defaultDate, onClose, onCreated,
}: {
  teams: TeamInfo[]; defaultDate: string; onClose: () => void; onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [teamIds, setTeamIds] = useState<string[]>(teams[0] ? [teams[0].id] : []);
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [priority, setPriority] = useState("normal");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [assignees, setAssignees] = useState<Set<string>>(new Set());
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
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, teamIds, assignees: Array.from(assignees), priority, location, description, ...when,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error ?? "등록에 실패했습니다."); return; }
    onCreated();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>업무 추가</h2>
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
            <label className="switch-row">
              <span>하루 종일</span>
              <input type="checkbox" className="switch" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            </label>
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

          <div className="field">
            <label>우선순위</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">낮음</option>
              <option value="normal">보통</option>
              <option value="high">높음</option>
              <option value="urgent">긴급</option>
            </select>
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
            <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
            <button className="btn btn-primary" disabled={loading}>{loading ? "등록 중…" : "등록"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── 업무 상세 모달 ── */
function TaskDetailModal({
  task, onClose, onChanged,
}: {
  task: TaskItem; onClose: () => void; onChanged: () => void;
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const teamIds = task.teams.map((t) => t.id);
  const isOrgEditor = ["admin", "manager", "deputy"].includes(user?.orgRole ?? "");
  const myRoles = teamIds.map((id) => user?.teams?.find((m) => m.teamId === id)?.role ?? null);
  const canEdit = isOrgEditor || myRoles.some((r) => r === "leader" || r === "vice_leader");
  const canDelete = user?.orgRole === "admin" || myRoles.some((r) => r === "leader");
  const isAssignee = task.assignees.some((a) => a.id === user?.id);
  const canStatus = canEdit || (myRoles.includes("member") && isAssignee);

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

  async function remove() {
    if (!confirm("이 업무를 삭제할까요?")) return;
    setBusy(true);
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "삭제 실패"); return; }
    onChanged();
  }

  const [stLabel, stColor] = STATUS_LABEL[task.status] ?? STATUS_LABEL.todo;
  const fmt = (d: string) =>
    new Date(d).toLocaleString("ko-KR",
      task.allDay
        ? { month: "long", day: "numeric" }
        : { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {task.teams.map((tm) => (
            <span className="chip" key={tm.id}>
              <span className="dot" style={{ background: tm.color }} />
              {tm.name}
            </span>
          ))}
          <span className="status-pill" style={{ background: `color-mix(in srgb, ${stColor} 15%, transparent)`, color: stColor }}>
            {stLabel}
          </span>
          <span className="chip">{PRIORITY_LABEL[task.priority] ?? task.priority}</span>
        </div>
        <h2 style={{ marginBottom: 14 }}>{task.title}</h2>
        <dl className="detail-meta">
          <div><dt>기간</dt><dd>{fmt(task.startDate)} ~ {fmt(task.endDate)}</dd></div>
          {task.location && <div><dt>장소</dt><dd>{task.location}</dd></div>}
          {task.assignees.length > 0 && (
            <div><dt>담당</dt><dd>{task.assignees.map((a) => a.name).join(", ")}</dd></div>
          )}
        </dl>
        {task.description && (
          <p style={{ fontSize: 14.5, color: "var(--ink-soft)", whiteSpace: "pre-wrap", marginTop: 14, lineHeight: 1.6 }}>
            {task.description}
          </p>
        )}

        {canStatus && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 8 }}>상태 변경</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(STATUS_LABEL).map(([key, [label]]) => (
                <button
                  key={key}
                  className={`btn btn-sm ${task.status === key ? "btn-primary" : "btn-ghost"}`}
                  disabled={busy || task.status === key}
                  onClick={() => setStatus(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {err && <p className="err-msg">{err}</p>}
        <div className="modal-actions">
          {canDelete && (
            <button className="btn btn-danger" disabled={busy} onClick={remove}>삭제</button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
