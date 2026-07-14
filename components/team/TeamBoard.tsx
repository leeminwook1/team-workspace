"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import koLocale from "@fullcalendar/core/locales/ko";
import { Icon } from "@/components/icons";
import { useAutoRefresh } from "@/components/useAutoRefresh";

export type MemberStat = {
  id: string;
  name: string;
  roleLabel: string;
  isLeader: boolean;
  inProgress: number;
  weekDue: number;
  overdue: number;
  overdueItems: { id: string; title: string }[];
  doneWeek: number;
};

type OverlayEvent = { id: string; userId: string; title: string; startDate: string; endDate: string; allDay: boolean };
type OverlayMember = { id: string; name: string; role: string };

// 멤버별 오버레이 색 팔레트 (Toss 톤)
const PALETTE = ["#3182f6", "#f04452", "#12b3a6", "#8b5cf6", "#e8951b", "#f0466e", "#22c55e", "#0ea5e9", "#f97316", "#64748b"];

export default function TeamBoard({
  teamName, teamColor, teamId, teams, stats,
}: {
  teamName: string;
  teamColor: string;
  teamId: string;
  teams: { id: string; name: string; color: string }[]; // 전사 역할만 채워짐 (팀 전환용)
  stats: MemberStat[];
}) {
  const router = useRouter();
  const calRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<OverlayEvent[]>([]);
  const [members, setMembers] = useState<OverlayMember[]>([]);
  const [hiddenNames, setHiddenNames] = useState<string[]>([]);
  const [offMembers, setOffMembers] = useState<Set<string>>(new Set()); // 레전드에서 끈 멤버
  const [curStart, setCurStart] = useState<Date | null>(null);

  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m, i) => map.set(m.id, PALETTE[i % PALETTE.length]));
    return map;
  }, [members]);

  const [overlayErr, setOverlayErr] = useState(false);
  const lastRange = useRef<{ from: string; to: string } | null>(null);
  const fetchOverlay = useCallback(async (from: string, to: string) => {
    try {
      const res = await fetch(`/api/personal-events/overlay?team=${teamId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setEvents(data.events ?? []);
      setMembers(data.members ?? []);
      setHiddenNames(data.hidden ?? []);
      setOverlayErr(false);
    } catch {
      setEvents([]); setMembers([]);
      setOverlayErr(true);
    }
  }, [teamId]);

  const fcEvents = events
    .filter((e) => !offMembers.has(e.userId))
    .map((e) => {
      const color = colorOf.get(e.userId) ?? "#8b95a1";
      const owner = members.find((m) => m.id === e.userId)?.name ?? "";
      let end = e.endDate;
      if (e.allDay) {
        const d = new Date(e.endDate);
        d.setDate(d.getDate() + 1);
        end = d.toISOString();
      }
      return {
        id: e.id, title: `${owner} · ${e.title}`, start: e.startDate, end, allDay: e.allDay,
        backgroundColor: color + "22", borderColor: color, textColor: color,
      };
    });

  const toggleMember = (id: string) =>
    setOffMembers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // 자동 반영 — 개인일정 오버레이 갱신 (통계 카드는 서버 컴포넌트라 AutoRefresh가 담당)
  useAutoRefresh(() => {
    if (lastRange.current) fetchOverlay(lastRange.current.from, lastRange.current.to);
  }, ["personal"]);

  const api = () => calRef.current?.getApi();
  const monthLabel = curStart ? `${curStart.getFullYear()}년 ${curStart.getMonth() + 1}월` : "";

  return (
    <div className="teamboard">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            <span className="dot" style={{ background: teamColor, width: 12, height: 12, marginRight: 8 }} />
            {teamName} 팀 현황
          </h1>
          <p className="page-sub">팀원별 업무 부하와 개인 일정을 한눈에 확인하세요.</p>
        </div>
        {teams.length > 0 && (
          <select className="pc-viewer" value={teamId} onChange={(e) => router.push(`/team?team=${e.target.value}`)} aria-label="팀 선택">
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {/* 팀원별 현황 카드 */}
      {stats.length === 0 ? (
        <p className="muted-note">이 팀에 등록된 팀원이 없습니다.</p>
      ) : (
        <div className="tb-grid">
          {stats.map((s) => (
            <div className={`tb-card${s.overdue ? " late" : ""}`} key={s.id}>
              <div className="tb-card-head">
                <span className="avatar" aria-hidden>{s.name.slice(0, 1)}</span>
                <div>
                  <div className="tb-name">{s.name}</div>
                  <div className="tb-role">{s.roleLabel}</div>
                </div>
                {s.overdue > 0 && <span className="rsv-st rsv-st-overdue tb-late-badge">⚠ 지연 {s.overdue}</span>}
              </div>
              <div className="tb-nums">
                <div className="tb-num"><b>{s.inProgress}</b><span>진행 중</span></div>
                <div className="tb-num"><b>{s.weekDue}</b><span>주 마감</span></div>
                <div className="tb-num"><b className={s.overdue ? "danger" : ""}>{s.overdue}</b><span>지연</span></div>
                <div className="tb-num"><b>{s.doneWeek}</b><span>주 완료</span></div>
              </div>
              {s.overdueItems.length > 0 && (
                <div className="tb-overdue-list">
                  {s.overdueItems.map((t) => (
                    <Link key={t.id} href={`/calendar?task=${t.id}`} className="tb-overdue-item">· {t.title}</Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 개인일정 겹쳐보기 */}
      <div className="tb-cal-head">
        <h2><Icon name="userLine" size={17} /> 팀원 개인일정 겹쳐보기</h2>
        <div className="cal1c-nav">
          <button className="cal1c-arrow" aria-label="이전" onClick={() => api()?.prev()}><Icon name="chevronL" size={15} /></button>
          <span className="tb-cal-month">{monthLabel}</span>
          <button className="cal1c-arrow" aria-label="다음" onClick={() => api()?.next()}><Icon name="chevronR" size={15} /></button>
          <button className="cal1c-today" onClick={() => api()?.today()}>오늘</button>
        </div>
      </div>

      {members.length > 0 && (
        <div className="tb-legend">
          {members.map((m) => {
            const off = offMembers.has(m.id);
            return (
              <button key={m.id} className={`chip chip-btn${off ? "" : " sel"}`} style={off ? {} : { borderColor: colorOf.get(m.id) }} onClick={() => toggleMember(m.id)}>
                <span className="dot" style={{ background: colorOf.get(m.id), opacity: off ? 0.3 : 1 }} />
                <span style={{ opacity: off ? 0.5 : 1 }}>{m.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {hiddenNames.length > 0 && (
        <p className="muted-note tb-hidden-note">개인 캘린더 열람 권한이 없어 표시하지 않음: {hiddenNames.join(", ")}</p>
      )}
      {overlayErr && (
        <p className="err-msg" style={{ marginBottom: 10 }}>개인 일정을 불러오지 못했어요. 네트워크 확인 후 달을 이동하면 다시 시도합니다.</p>
      )}

      <div className="card cal-card" style={{ padding: 14 }}>
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin]}
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
          eventDidMount={(info) => { info.el.title = info.event.title; }}
          datesSet={(arg) => {
            setCurStart(arg.view.currentStart);
            lastRange.current = { from: arg.startStr, to: arg.endStr };
            fetchOverlay(arg.startStr, arg.endStr);
          }}
        />
      </div>
    </div>
  );
}
