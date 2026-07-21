"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { WIDGET_META, type WidgetId, type WidgetSlot } from "@/lib/widgets";

/* ── 위젯에 내려오는 직렬화 데이터 ── */
export type WTask = {
  id: string; title: string; startDate: string; endDate: string; allDay: boolean;
  status: string; priority: string; location: string;
  teams: { id: string; name: string; color: string }[];
  category?: { name: string; color: string } | null;
};

// 일정 대표색 — 카테고리 색 우선, 없으면 첫 팀 색
const taskColor = (t: WTask) => t.category?.color ?? t.teams[0]?.color ?? "#8b95a1";
export type WTodo = { id: string; title: string; dueDate: string | null; teamColor: string | null };
export type WResv = { id: string; start: string; end: string; resource: string; teamColor: string | null };
export type WDue = { eventId: string; eventTitle: string; title: string; dueDate: string; overdue: boolean };
export type WEvent = { id: string; title: string; total: number; pct: number };
export type WNotice = { id: string; title: string; pinned: boolean; isNew: boolean; author: string; createdAt: string };
export type WidgetData = {
  monthTasks: WTask[];
  mytasks: WTask[];
  upcoming: WTask[];
  todo: WTodo[];
  reservations: WResv[];
  duesoon: WDue[];
  events: WEvent[];
  notices: WNotice[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
const fmtMD = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });

// 업무가 해당 날짜(YYYY-MM-DD)에 걸치는지 — 날짜 문자열 비교 (allDay end는 inclusive)
function coversDay(t: WTask, day: string) {
  return ymd(new Date(t.startDate)) <= day && day <= ymd(new Date(t.endDate));
}

function EmptyMsg({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="dash-empty">
      <span className="dash-empty-ico"><Icon name={icon} size={18} /></span>
      <span>{text}</span>
    </div>
  );
}

function WidgetHead({ icon, tint, title, href, hrefLabel }: {
  icon: IconName; tint: string; title: string; href: string; hrefLabel: string;
}) {
  return (
    <div className="dash-card-head">
      <h2>
        <span className="dash-h-ico" style={{ background: `color-mix(in srgb, ${tint} 12%, transparent)`, color: tint }}>
          <Icon name={icon} size={14} />
        </span>
        {title}
      </h2>
      <Link href={href}>{hrefLabel} →</Link>
    </div>
  );
}

/* ══════════ ① 미니 달력 + 선택일 일정 (1d) ══════════ */
function MiniCalWidget({ initialTasks }: { initialTasks: WTask[] }) {
  const today = ymd(new Date());
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(today);
  const curKey = `${month.getFullYear()}-${pad(month.getMonth() + 1)}`;
  const todayKey = today.slice(0, 7);
  const [cache, setCache] = useState<Record<string, WTask[]>>({ [todayKey]: initialTasks });
  const [showDone, setShowDone] = useState(false);

  const tasks = cache[curKey];

  // 다른 달로 이동하면 그 달 업무를 지연 로드
  const [monthErr, setMonthErr] = useState(false); // 로드 실패 안내 (무음 실패 방지)
  function moveMonth(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setMonthErr(false);
    const key = `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
    if (!cache[key]) {
      const from = next.toISOString();
      const to = new Date(next.getFullYear(), next.getMonth() + 1, 1).toISOString();
      fetch(`/api/tasks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.tasks) setCache((c) => ({ ...c, [key]: d.tasks }));
          else setMonthErr(true);
        })
        .catch(() => setMonthErr(true));
    }
  }

  // 달력 셀 (일요일 시작, 앞뒤 이웃달 포함)
  const cells = useMemo(() => {
    const y = month.getFullYear(), m = month.getMonth();
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const offset = first.getDay();
    const total = Math.ceil((offset + days) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(y, m, i - offset + 1);
      return { day: ymd(d), num: d.getDate(), inMonth: d.getMonth() === m, weekday: d.getDay() };
    });
  }, [month]);

  const dotsFor = (day: string) => {
    const colors: string[] = [];
    for (const t of tasks ?? []) {
      if (!coversDay(t, day)) continue;
      const c = taskColor(t);
      if (!colors.includes(c)) colors.push(c);
      if (colors.length >= 3) break;
    }
    return colors;
  };

  const dayTasks = (tasks ?? []).filter((t) => coversDay(t, selected))
    .sort((a, b) => (a.allDay === b.allDay ? a.startDate.localeCompare(b.startDate) : a.allDay ? -1 : 1));
  const active = dayTasks.filter((t) => t.status !== "done");
  const doneTasks = dayTasks.filter((t) => t.status === "done");
  const selDate = new Date(selected);
  const selLabel = `${selDate.getMonth() + 1}월 ${selDate.getDate()}일 ${WEEKDAYS[selDate.getDay()]}요일`;

  return (
    <>
      <div className="mc-head">
        <span className="mc-title">{month.getFullYear()}년 {month.getMonth() + 1}월</span>
        <button className="mc-arrow" aria-label="이전 달" onClick={() => moveMonth(-1)}><Icon name="chevronL" size={14} /></button>
        <button className="mc-arrow" aria-label="다음 달" onClick={() => moveMonth(1)}><Icon name="chevronR" size={14} /></button>
        <div style={{ flex: 1 }} />
        <Link href="/calendar" className="mc-link">달력 →</Link>
      </div>
      {monthErr && (
        <p className="muted-note" style={{ margin: "0 0 6px", fontSize: 12 }}>
          이 달 일정을 불러오지 못했어요. 달을 다시 이동하면 재시도합니다.
        </p>
      )}
      <div className="mc-grid mc-week">
        {WEEKDAYS.map((w, i) => (
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
              onClick={() => setSelected(c.day)}
            >
              <span className={`mc-num${c.weekday === 0 ? " sun" : c.weekday === 6 ? " sat" : ""}`}>{c.num}</span>
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
        {tasks && active.length === 0 && doneTasks.length === 0 && (
          <EmptyMsg icon="calendar" text="이 날짜엔 일정이 없어요." />
        )}
        {(showDone ? [...active, ...doneTasks] : active).map((t) => (
          <Link key={t.id} href={`/calendar?task=${t.id}`} className={`mc-item${t.status === "done" ? " done" : ""}`}>
            <span className="mc-bar" style={{ background: taskColor(t) }} />
            <span className="mc-item-body">
              <span className="mc-item-title">{t.title}</span>
              <span className="mc-item-sub">
                {t.allDay ? "하루 종일" : `${fmtTime(t.startDate)}–${fmtTime(t.endDate)}`}
                {t.teams.length > 0 && ` · ${t.teams.map((tm) => tm.name).join("·")}`}
                {t.location && ` · ${t.location}`}
              </span>
            </span>
            {t.status === "in_progress" && <span className="wbadge prog">진행중</span>}
            {t.status === "todo" && <span className="wbadge">예정</span>}
            {t.status === "hold" && <span className="wbadge">보류</span>}
            {t.status === "done" && <span className="wbadge done">완료</span>}
          </Link>
        ))}
        {doneTasks.length > 0 && (
          <button className="mc-done-toggle" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "완료된 일정 접기" : `완료된 일정 ${doneTasks.length}건 보기`}
          </button>
        )}
      </div>
    </>
  );
}

/* ══════════ ①-1 내 담당 업무 — 미완료, 마감 임박순 ══════════ */
function MyTasksWidget({ tasks }: { tasks: WTask[] }) {
  const today = ymd(new Date());
  return (
    <>
      <WidgetHead icon="check" tint="var(--st-prog)" title="내 담당 업무" href="/calendar" hrefLabel="달력" />
      {tasks.length === 0 ? (
        <EmptyMsg icon="check" text="담당 중인 미완료 업무가 없어요. 🎉" />
      ) : (
        <div className="up-list">
          {tasks.map((t) => {
            const end = new Date(t.endDate);
            const overdue = ymd(end) < today;
            const color = overdue ? "var(--danger)" : taskColor(t);
            return (
              <Link key={t.id} href={`/calendar?task=${t.id}`} className="up-item">
                <span className="up-date" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
                  <b>{end.getDate()}</b>
                  <span>{overdue ? "지남" : WEEKDAYS[end.getDay()]}</span>
                </span>
                <span className="up-body">
                  <span className="up-title">
                    {t.title}
                    {overdue && <b className="ev1c-urgent">지연</b>}
                    {!overdue && t.priority === "urgent" && <b className="ev1c-urgent">긴급</b>}
                  </span>
                  <span className="up-sub">
                    {fmtMD(t.endDate)}까지
                    {t.teams.length > 0 && ` · ${t.teams.map((tm) => tm.name).join("·")}`}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ══════════ ② 다가오는 일정 ══════════ */
function UpcomingWidget({ tasks }: { tasks: WTask[] }) {
  return (
    <>
      <WidgetHead icon="clock" tint="var(--primary)" title="다가오는 일정" href="/calendar" hrefLabel="달력" />
      {tasks.length === 0 ? (
        <EmptyMsg icon="calendar" text="예정된 일정이 없어요." />
      ) : (
        <div className="up-list">
          {tasks.map((t) => {
            const d = new Date(t.startDate);
            const color = taskColor(t);
            return (
              <Link key={t.id} href={`/calendar?task=${t.id}`} className="up-item">
                <span className="up-date" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
                  <b>{d.getDate()}</b>
                  <span>{WEEKDAYS[d.getDay()]}</span>
                </span>
                <span className="up-body">
                  <span className="up-title">
                    {t.title}
                    {t.priority === "urgent" && <b className="ev1c-urgent">긴급</b>}
                  </span>
                  <span className="up-sub">
                    {t.teams.map((tm) => tm.name).join("·")}
                    {t.location && ` · ${t.location}`}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ══════════ ③ 이번 달 진행 현황 ══════════ */
function ProgressWidget({ tasks }: { tasks: WTask[] }) {
  const total = tasks.length;
  const rows = [
    { label: "완료", color: "var(--st-done)", n: tasks.filter((t) => t.status === "done").length },
    { label: "진행중", color: "var(--st-prog)", n: tasks.filter((t) => t.status === "in_progress").length },
    { label: "예정", color: "var(--line-strong)", n: tasks.filter((t) => t.status === "todo" || t.status === "hold").length },
  ];
  return (
    <>
      <WidgetHead icon="check" tint="var(--st-done)" title="이번 달 진행 현황" href="/calendar" hrefLabel="달력" />
      {total === 0 ? (
        <EmptyMsg icon="check" text="이번 달 등록된 업무가 없어요." />
      ) : (
        <div className="pg-list">
          {rows.map((r) => (
            <div key={r.label} className="pg-row">
              <div className="pg-row-head">
                <span>{r.label}</span>
                <b style={{ color: r.color }}>{r.n}건</b>
              </div>
              <div className="pg-track"><div style={{ width: `${total ? Math.round((r.n / total) * 100) : 0}%`, background: r.color }} /></div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ══════════ ④⑤⑥⑦ 리스트형 위젯 ══════════ */
function TodoWidget({ items }: { items: WTodo[] }) {
  return (
    <>
      <WidgetHead icon="inbox" tint="var(--st-prog)" title="대기 중 TODO" href="/directives" hrefLabel="전체" />
      {items.length === 0 ? (
        <EmptyMsg icon="check" text="대기 중인 TODO가 없어요." />
      ) : (
        <ul className="dash-list">
          {items.map((d) => (
            <li key={d.id}>
              <Link href="/directives" className="dash-row">
                <span className="dash-row-dots">{d.teamColor && <span className="dot" style={{ background: d.teamColor }} />}</span>
                <span className="dash-row-title">{d.title}</span>
                {d.dueDate && <span className="dash-row-sub">마감 {fmtMD(d.dueDate)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ReservationsWidget({ items }: { items: WResv[] }) {
  return (
    <>
      <WidgetHead icon="resources" tint="var(--st-done)" title="오늘 자원 예약" href="/resources" hrefLabel="예약" />
      {items.length === 0 ? (
        <EmptyMsg icon="resources" text="오늘 예약된 장비·자원이 없어요." />
      ) : (
        <ul className="dash-list">
          {items.map((r) => (
            <li key={r.id}>
              <Link href="/resources" className="dash-row">
                <span className="dash-time" style={{ minWidth: 74 }}>{fmtTime(r.start)}~{fmtTime(r.end)}</span>
                <span className="dash-row-title">{r.resource}</span>
                <span className="dash-row-dots">{r.teamColor && <span className="dot" style={{ background: r.teamColor }} />}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function DueSoonWidget({ items }: { items: WDue[] }) {
  return (
    <>
      <WidgetHead icon="clock" tint="var(--danger)" title="마감 임박 할 일" href="/events" hrefLabel="행사" />
      {items.length === 0 ? (
        <EmptyMsg icon="check" text="7일 내 마감인 할 일이 없어요." />
      ) : (
        <ul className="dash-list">
          {items.map((d, i) => (
            <li key={i}>
              <Link href={`/events/${d.eventId}`} className="dash-row">
                <span className={`dash-due${d.overdue ? " overdue" : ""}`}>{d.overdue ? "지연" : fmtMD(d.dueDate)}</span>
                <span className="dash-row-title">{d.title}</span>
                <span className="dash-row-sub">{d.eventTitle}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function NoticesWidget({ items }: { items: WNotice[] }) {
  return (
    <>
      <WidgetHead icon="megaphone" tint="#f0466e" title="공지사항" href="/notices" hrefLabel="전체" />
      {items.length === 0 ? (
        <EmptyMsg icon="megaphone" text="아직 공지가 없어요." />
      ) : (
        <ul className="dash-list">
          {items.map((n) => (
            <li key={n.id}>
              <Link href="/notices" className="dash-row">
                <span className="dash-row-title">
                  {n.pinned && <span title="고정 공지">📌 </span>}
                  {n.title}
                  {n.isNew && <b className="wnotice-new">N</b>}
                </span>
                <span className="dash-row-sub">{n.author && `${n.author} · `}{fmtMD(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EventsWidget({ items }: { items: WEvent[] }) {
  return (
    <>
      <WidgetHead icon="board" tint="#8b5cf6" title="진행 중 행사" href="/events" hrefLabel="전체" />
      {items.length === 0 ? (
        <EmptyMsg icon="board" text="진행 중인 행사가 없어요." />
      ) : (
        <ul className="dash-list">
          {items.map((e) => (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="dash-row dash-row-col">
                <span className="dash-row-between">
                  <span className="dash-row-title">{e.title}</span>
                  <span className="dash-pct">{e.total ? `${e.pct}%` : "—"}</span>
                </span>
                <span className="kb-check-bar"><span style={{ width: `${e.pct}%` }} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ══════════ 위젯 그리드 + 편집 모드 ══════════ */
export default function HomeWidgets({ initialLayout, canDirectives, data }: {
  initialLayout: WidgetSlot[]; canDirectives: boolean; data: WidgetData;
}) {
  const [layout, setLayout] = useState<WidgetSlot[]>(initialLayout);
  const [snapshot, setSnapshot] = useState<WidgetSlot[]>(initialLayout);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const available = (Object.keys(WIDGET_META) as WidgetId[])
    .filter((id) => (id === "todo" ? canDirectives : true))
    .filter((id) => !layout.some((w) => w.id === id));

  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= layout.length) return;
    const next = [...layout];
    [next[i], next[j]] = [next[j], next[i]];
    setLayout(next);
  }
  // 드래그한 위젯을 대상 위치에 삽입 (나머지는 밀림)
  function moveTo(from: number, to: number) {
    if (from === to) return;
    const next = [...layout];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setLayout(next);
  }
  function resize(i: number) {
    setLayout(layout.map((w, k) => (k === i ? { ...w, size: w.size === 2 ? 1 : 2 } : w)));
  }
  function remove(i: number) {
    setLayout(layout.filter((_, k) => k !== i));
  }
  function add(id: WidgetId) {
    setLayout([...layout, { id, size: 1 }]);
  }

  async function save() {
    setSaving(true);
    setErr("");
    const res = await fetch("/api/me/home-layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout }),
    });
    setSaving(false);
    if (!res.ok) { setErr("저장에 실패했습니다. 잠시 후 다시 시도해주세요."); return; }
    setSnapshot(layout);
    setEditing(false);
  }

  function renderWidget(id: WidgetId) {
    switch (id) {
      case "minical": return <MiniCalWidget initialTasks={data.monthTasks} />;
      case "mytasks": return <MyTasksWidget tasks={data.mytasks} />;
      case "upcoming": return <UpcomingWidget tasks={data.upcoming} />;
      case "progress": return <ProgressWidget tasks={data.monthTasks} />;
      case "todo": return <TodoWidget items={data.todo} />;
      case "reservations": return <ReservationsWidget items={data.reservations} />;
      case "duesoon": return <DueSoonWidget items={data.duesoon} />;
      case "events": return <EventsWidget items={data.events} />;
      case "notices": return <NoticesWidget items={data.notices} />;
    }
  }

  return (
    <div>
      <div className="wg-bar">
        <span className="wg-bar-label">내 위젯</span>
        {editing ? (
          <>
            {err && <span className="err-msg" style={{ margin: 0 }}>{err}</span>}
            <button className="btn btn-ghost btn-sm" onClick={() => { setLayout(snapshot); setEditing(false); setErr(""); }}>취소</button>
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? "저장 중…" : "저장"}</button>
          </>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={() => { setSnapshot(layout); setEditing(true); }}>
            <Icon name="admin" size={14} /> 위젯 편집
          </button>
        )}
      </div>

      <div className="wgrid">
        {layout.map((w, i) => (
          <section
            key={w.id}
            className={`card dash-card wg${w.size === 2 ? " wg-2" : ""}${editing ? " wg-editing" : ""}${dragIdx === i ? " wg-dragging" : ""}${overIdx === i && dragIdx !== null && dragIdx !== i ? " wg-over" : ""}`}
            draggable={editing}
            onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { if (dragIdx === null) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overIdx !== i) setOverIdx(i); }}
            onDragLeave={() => { if (overIdx === i) setOverIdx(null); }}
            onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) moveTo(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
          >
            {editing && (
              <div className="wg-ctrl">
                <button title="앞으로" aria-label="위젯 앞으로 이동" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevronL" size={13} /></button>
                <button title="뒤로" aria-label="위젯 뒤로 이동" disabled={i === layout.length - 1} onClick={() => move(i, 1)}><Icon name="chevronR" size={13} /></button>
                <button className="wg-ctrl-size" title="크기 전환" onClick={() => resize(i)}>{w.size === 2 ? "반폭" : "전폭"}</button>
                <button className="wg-ctrl-x" title="제거" aria-label="위젯 제거" onClick={() => remove(i)}>✕</button>
              </div>
            )}
            <div className="wg-body">{renderWidget(w.id)}</div>
          </section>
        ))}
      </div>

      {editing && (
        <div className="wg-gallery">
          <div className="wg-gallery-label">위젯 추가</div>
          {available.length === 0 ? (
            <span className="wg-gallery-empty">추가할 수 있는 위젯을 모두 사용 중이에요.</span>
          ) : (
            <div className="wg-gallery-row">
              {available.map((id) => (
                <button key={id} className="wg-add" onClick={() => add(id)}>
                  <Icon name="plus" size={13} strokeWidth={2.6} />
                  <span>
                    <b>{WIDGET_META[id].label}</b>
                    <em>{WIDGET_META[id].desc}</em>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
