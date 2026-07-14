"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import koLocale from "@fullcalendar/core/locales/ko";
import { Icon } from "@/components/icons";
import { useAutoRefresh } from "@/components/useAutoRefresh";
import { useConfirm } from "@/components/ConfirmProvider";
import { ModalClose } from "@/components/ModalClose";
import { ABSENCE_LABEL, HALF_DAY_TYPES, type AbsenceType } from "@/lib/absenceTypes";

type OverlayEvent = { id: string; userId: string; title: string; startDate: string; endDate: string; allDay: boolean };
type OverlayMember = { id: string; name: string; role: string };
type AbsenceItem = {
  id: string; user: { id: string; name: string } | null; team: { id: string; name: string; color: string } | null;
  type: AbsenceType; typeLabel: string; startDate: string; endDate: string; note: string;
};

// 멤버별 오버레이 색 팔레트 (Toss 톤)
const PALETTE = ["#3182f6", "#f04452", "#12b3a6", "#8b5cf6", "#e8951b", "#f0466e", "#22c55e", "#0ea5e9", "#f97316", "#64748b"];

export default function TeamBoard({
  teamName, teamColor, teamId, teams,
}: {
  teamName: string;
  teamColor: string;
  teamId: string;
  teams: { id: string; name: string; color: string }[]; // 전사 역할만 채워짐 (팀 전환용)
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const me = session?.user;
  const confirm = useConfirm();
  const calRef = useRef<FullCalendar>(null);
  const [events, setEvents] = useState<OverlayEvent[]>([]);
  const [members, setMembers] = useState<OverlayMember[]>([]);
  const [hiddenNames, setHiddenNames] = useState<string[]>([]);
  const [offMembers, setOffMembers] = useState<Set<string>>(new Set()); // 레전드에서 끈 멤버
  const [curStart, setCurStart] = useState<Date | null>(null);

  // ── 부재·휴가 ──
  const [absences, setAbsences] = useState<AbsenceItem[]>([]);
  const [absOpen, setAbsOpen] = useState(false);
  const fetchAbs = useCallback(async (from: string, to: string) => {
    try {
      const res = await fetch(`/api/absences?team=${teamId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!res.ok) return;
      const d = await res.json();
      setAbsences(d.absences ?? []);
    } catch {}
  }, [teamId]);
  // 등록 권한 — 전사 편집자 전체, 팀장·부팀장은 이 팀일 때, 팀원은 본인만(모달에서 처리)
  const isOrgEditor = ["admin", "manager", "deputy", "secretary"].includes(me?.role ?? "");
  const isTeamLead = ["leader", "vice_leader"].includes(me?.role ?? "") && me?.teamId === teamId;
  const canAbsForOthers = isOrgEditor || isTeamLead;
  const canAbsSelf = me?.teamId === teamId || isOrgEditor; // 내 팀 화면이면 본인 등록 가능
  const canDeleteAbs = (a: AbsenceItem) => canAbsForOthers || a.user?.id === me?.id;

  async function removeAbs(a: AbsenceItem) {
    const ok = await confirm({
      title: "부재 삭제",
      message: `${a.user?.name ?? "?"} ${a.typeLabel} (${fmtD(a.startDate)}~${fmtD(a.endDate)})을(를) 삭제할까요?`,
      confirmText: "삭제", danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/absences/${a.id}`, { method: "DELETE" });
    if (res.ok && lastRange.current) fetchAbs(lastRange.current.from, lastRange.current.to);
  }

  const fmtD = (iso: string) => {
    const d = new Date(iso);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  };

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

  const fcEvents = [
    ...events
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
      }),
    // 부재·휴가 — 회색 계열로 구분해 함께 표시
    ...absences.map((a) => {
      const end = new Date(a.endDate);
      end.setUTCDate(end.getUTCDate() + 1); // allDay end exclusive
      return {
        id: `abs-${a.id}`,
        title: `🏖 ${a.user?.name ?? "?"} ${a.typeLabel}`,
        start: a.startDate.slice(0, 10), end: end.toISOString().slice(0, 10), allDay: true,
        backgroundColor: "color-mix(in srgb, #f04452 9%, transparent)",
        borderColor: "color-mix(in srgb, #f04452 45%, transparent)",
        textColor: "#f04452",
      };
    }),
  ];

  const toggleMember = (id: string) =>
    setOffMembers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // 자동 반영 — 개인일정 오버레이·부재 갱신 (통계 카드는 서버 컴포넌트라 AutoRefresh가 담당)
  useAutoRefresh(() => {
    if (lastRange.current) {
      fetchOverlay(lastRange.current.from, lastRange.current.to);
      fetchAbs(lastRange.current.from, lastRange.current.to);
    }
  }, ["personal", "absence"]);

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
          <p className="page-sub">팀원들의 개인 일정을 한눈에 겹쳐서 확인하세요.</p>
        </div>
        {teams.length > 0 && (
          <select className="pc-viewer" value={teamId} onChange={(e) => router.push(`/team?team=${e.target.value}`)} aria-label="팀 선택">
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

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

      <div className="card cal-card pc-cal" style={{ padding: 14 }}>
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
            fetchAbs(arg.startStr, arg.endStr);
          }}
        />
      </div>

      {/* 부재·휴가 — 이 달 명단 + 등록 */}
      <div className="tb-cal-head" style={{ marginTop: 22 }}>
        <h2><Icon name="clock" size={17} /> 부재·휴가</h2>
        {(canAbsForOthers || canAbsSelf) && (
          <button className="btn btn-primary btn-sm" onClick={() => setAbsOpen(true)}>+ 부재 등록</button>
        )}
      </div>
      <div className="card abs-card">
        {absences.length === 0 ? (
          <p className="muted-note" style={{ padding: "14px 4px" }}>이 달에 등록된 부재가 없어요. 연차·출장을 등록하면 달력과 업무 배정에 반영됩니다.</p>
        ) : (
          <div className="abs-list">
            {absences.map((a) => (
              <div className="abs-row" key={a.id}>
                <span className="abs-name">{a.user?.name ?? "?"}</span>
                <span className={`abs-type t-${a.type}`}>{a.typeLabel}</span>
                <span className="abs-period">
                  {fmtD(a.startDate)}{a.startDate.slice(0, 10) !== a.endDate.slice(0, 10) ? ` ~ ${fmtD(a.endDate)}` : ""}
                </span>
                {a.note && <span className="abs-note">· {a.note}</span>}
                {canDeleteAbs(a) && (
                  <button className="rc-cat-btn danger abs-del" onClick={() => removeAbs(a)}>삭제</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {absOpen && (
        <AbsenceModal
          teamId={teamId}
          selfOnly={!canAbsForOthers}
          meId={me?.id ?? ""}
          meName={me?.name ?? ""}
          onClose={() => setAbsOpen(false)}
          onSaved={() => {
            setAbsOpen(false);
            if (lastRange.current) fetchAbs(lastRange.current.from, lastRange.current.to);
          }}
        />
      )}
    </div>
  );
}

/* ── 부재 등록 모달 ── */
function AbsenceModal({
  teamId, selfOnly, meId, meName, onClose, onSaved,
}: {
  teamId: string; selfOnly: boolean; meId: string; meName: string; onClose: () => void; onSaved: () => void;
}) {
  const today = (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ userId: selfOnly ? meId : "", type: "vacation" as AbsenceType, startDate: today, endDate: today, note: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const half = HALF_DAY_TYPES.includes(form.type);

  useEffect(() => {
    if (selfOnly) return;
    fetch(`/api/users?team=${teamId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = (d?.users ?? []).map((u: any) => ({ id: u.id, name: u.name }));
        setMembers(list);
        setForm((f) => (f.userId ? f : { ...f, userId: list[0]?.id ?? "" }));
      })
      .catch(() => {});
  }, [teamId, selfOnly]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!form.userId) { setErr("대상을 선택하세요."); return; }
    if (!half && form.endDate < form.startDate) { setErr("종료일이 시작일보다 빠를 수 없어요."); return; }
    setBusy(true);
    const res = await fetch("/api/absences", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, endDate: half ? form.startDate : form.endDate }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "등록 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>부재 등록</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label>대상</label>
            {selfOnly ? (
              <input value={meName} disabled />
            ) : (
              <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>
          <div className="field">
            <label>유형</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AbsenceType })}>
              {(Object.keys(ABSENCE_LABEL) as AbsenceType[]).map((t) => (
                <option key={t} value={t}>{ABSENCE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>{half ? "날짜" : "시작일"}</label>
              <input type="date" value={form.startDate} required
                onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, startDate: v, endDate: f.endDate < v ? v : f.endDate })); }} />
            </div>
            {!half && (
              <div className="field">
                <label>종료일</label>
                <input type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
              </div>
            )}
          </div>
          <div className="field">
            <label>메모 (선택)</label>
            <input value={form.note} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="예: 가족 행사" />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? "등록 중…" : "등록"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
