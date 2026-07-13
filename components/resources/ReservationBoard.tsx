"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import koLocale from "@fullcalendar/core/locales/ko";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAutoRefresh } from "@/components/useAutoRefresh";

type ResourceOpt = {
  id: string; name: string;
  category: { id: string; name: string; color?: string; order: number } | null;
  ownerTeam?: { name: string; color: string } | null; // 관리 팀
  manager?: { id: string; name: string } | null; // 관리 담당자
};
type TeamOpt = { id: string; name: string; color: string };
type ReservationItem = {
  id: string;
  resource: { id: string; name: string } | null;
  reservedBy: { id: string; name: string } | null;
  team: { id: string; name: string; color: string } | null;
  startAt: string;
  endAt: string;
  note: string;
  status: "booked" | "returned";
  returnedAt: string | null;
  returnedByName: string | null;
};

// 예약 한 건의 진행 상태 — 예정 / 사용 중 / 미반납(지연) / 반납 완료
type RsvState = "upcoming" | "inuse" | "overdue" | "returned";
const GRACE_MS = 10 * 60_000; // 종료 후 10분 유예
// YYYY-MM-DD 문자열에 일수 더하기
function addDays(ymd: string, days: number) {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function rsvState(r: ReservationItem): RsvState {
  if (r.status === "returned") return "returned";
  const now = Date.now();
  if (now < new Date(r.startAt).getTime()) return "upcoming";
  if (now <= new Date(r.endAt).getTime() + GRACE_MS) return "inuse";
  return "overdue";
}
const STATE_LABEL: Record<RsvState, string> = {
  upcoming: "예정", inuse: "사용 중", overdue: "미반납", returned: "반납 완료",
};

export default function ReservationBoard({
  resources, teams,
}: {
  resources: ResourceOpt[]; teams: TeamOpt[];
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const confirm = useConfirm();

  const [selected, setSelected] = useState(resources[0]?.id ?? "");
  const [list, setList] = useState<ReservationItem[]>([]);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"list" | "timeline">("list");
  const [weekEvents, setWeekEvents] = useState<any[]>([]);
  const [weekRange, setWeekRange] = useState<{ from: string; to: string } | null>(null);

  const fetchWeek = useCallback(async (from: string, to: string) => {
    setWeekRange({ from, to });
    let res: Response;
    try {
      res = await fetch(`/api/reservations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    } catch { setErr("예약을 불러오지 못했어요. 네트워크를 확인해주세요."); return; }
    if (!res.ok) return;
    const data = await res.json();
    setWeekEvents((data.reservations ?? []).map((r: ReservationItem) => {
      const color = r.team?.color ?? "#8b95a1";
      const returned = r.status === "returned";
      const start = new Date(r.startAt);
      const end = new Date(r.endAt);
      // 하루를 넘는 기간 대여 → 상단 종일 줄에 가로 막대로 (시간 그리드에 세로로 뭉개지지 않게)
      const multiDay = end.getTime() - start.getTime() >= 20 * 3600_000 || start.toDateString() !== end.toDateString();
      const base = {
        id: r.id,
        title: `${r.resource?.name ?? "?"}${r.team ? ` · ${r.team.name}` : ""}${returned ? " ✓" : ""}`,
        backgroundColor: color + (returned ? "12" : "26"),
        borderColor: returned ? color + "55" : color,
        textColor: returned ? color + "99" : color,
        extendedProps: { resId: r.id, byId: r.reservedBy?.id, byName: r.reservedBy?.name ?? "?", returned },
      };
      if (multiDay) {
        // 종일 이벤트의 end는 배타적 — 종료 시각이 자정이 아니면 다음 날까지 포함.
        // 타임존 혼선을 피하려고 날짜 전용 문자열(YYYY-MM-DD)로 넘긴다.
        const endDay = new Date(end);
        if (endDay.getHours() !== 0 || endDay.getMinutes() !== 0) endDay.setDate(endDay.getDate() + 1);
        const ymd = (d: Date) => {
          const p = (n: number) => String(n).padStart(2, "0");
          return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        };
        return { ...base, start: ymd(start), end: ymd(endDay), allDay: true };
      }
      return { ...base, start: r.startAt, end: r.endAt };
    }));
  }, []);

  // 예약 가능한 팀 (팀 소속이면 팀원 포함 누구나 / 전사 편집자는 전체)
  const isOrgEditor = ["admin", "manager", "deputy", "secretary"].includes(user?.role ?? "");
  const canReserveOwn = ["leader", "vice_leader", "member"].includes(user?.role ?? "");
  const reservableTeams = useMemo(() => {
    if (!user) return [];
    if (isOrgEditor) return teams;
    if (canReserveOwn && user.teamId) return teams.filter((t) => t.id === user.teamId);
    return [];
  }, [teams, user, isOrgEditor, canReserveOwn]);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    teamId: "", startDate: today, endDate: addDays(today, 6), startTime: "10:00", endTime: "18:00", note: "",
  });
  // 대여 일수 (시작·종료일 포함)
  const rentalDays = (() => {
    const s = new Date(form.startDate), e = new Date(form.endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    return Math.round((e.getTime() - s.getTime()) / 86400_000) + 1;
  })();

  useEffect(() => {
    if (!form.teamId && reservableTeams.length > 0) {
      setForm((f) => ({ ...f, teamId: reservableTeams[0].id }));
    }
  }, [reservableTeams, form.teamId]);

  const load = useCallback(async (resourceId: string) => {
    if (!resourceId) return;
    const from = new Date();
    from.setDate(from.getDate() - 1);
    const to = new Date();
    to.setDate(to.getDate() + 60);
    try {
      const res = await fetch(
        `/api/reservations?resource=${resourceId}&from=${from.toISOString()}&to=${to.toISOString()}`
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setList(data.reservations ?? []);
      setErr("");
    } catch {
      setErr("예약 목록을 불러오지 못했어요. 네트워크 확인 후 새로고침해주세요.");
    }
  }, []);

  useEffect(() => { load(selected); }, [selected, load]);
  // 자동 반영 — 다른 팀이 예약·반납해도 새로고침 없이 갱신
  useAutoRefresh(() => {
    load(selected);
    if (view === "timeline" && weekRange) fetchWeek(weekRange.from, weekRange.to);
  }, ["reservation"]);

  async function reserve(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setOk("");
    setBusy(true);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceId: selected,
        teamId: form.teamId,
        // 기간 대여: 시작일의 시작시각 ~ 종료일의 종료시각
        startAt: `${form.startDate}T${form.startTime}:00`,
        endAt: `${form.endDate}T${form.endTime}:00`,
        note: form.note,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error ?? "예약 실패"); // 409 충돌 메시지 표시
      return;
    }
    setOk("예약 완료!");
    setForm((f) => ({ ...f, note: "" }));
    load(selected);
  }

  async function cancel(id: string) {
    const confirmed = await confirm({
      title: "예약 취소",
      message: "이 예약을 취소할까요?",
      confirmText: "예약 취소",
      cancelText: "닫기",
      danger: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/reservations/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "취소 실패"); return; }
    load(selected);
    if (weekRange) fetchWeek(weekRange.from, weekRange.to);
  }

  // 반납 처리 — 예약자·admin·과장단·장비 관리 담당자
  async function markReturned(id: string) {
    const confirmed = await confirm({
      title: "반납 처리",
      message: "이 장비를 반납 처리할까요? 반납하면 남은 시간에 다른 팀이 예약할 수 있어요.",
      confirmText: "반납 완료",
      cancelText: "닫기",
    });
    if (!confirmed) return;
    const res = await fetch(`/api/reservations/${id}/return`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "반납 처리 실패"); return; }
    setErr("");
    load(selected);
    if (weekRange) fetchWeek(weekRange.from, weekRange.to);
  }

  // 이 예약의 반납 버튼을 보여줄지 (서버에서 최종 검증)
  const isReturnManager = ["admin", "manager", "deputy"].includes(user?.role ?? "");
  function canReturnUi(r: ReservationItem) {
    if (r.reservedBy?.id === user?.id || isReturnManager) return true;
    const res = resources.find((x) => x.id === r.resource?.id);
    return res?.manager?.id === user?.id;
  }

  // 타임라인에서 예약 클릭 — 본인·admin이면 취소, 아니면 예약자 안내
  async function onTimelineClick(resId: string, byId?: string, byName?: string, returned?: boolean) {
    if (returned) {
      await confirm({ title: "예약 정보", message: `${byName ?? "?"} 님이 사용 후 반납한 예약입니다.`, confirmText: "확인", alert: true });
      return;
    }
    if (byId === user?.id || user?.role === "admin") {
      await cancel(resId);
    } else {
      await confirm({ title: "예약 정보", message: `${byName ?? "다른 팀"} 님이 예약한 시간입니다.`, confirmText: "확인", alert: true });
    }
  }

  // 분류별로 묶기 (분류 순서대로, 미분류는 맨 뒤)
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string; order: number; items: ResourceOpt[] }>();
    for (const r of resources) {
      const key = r.category?.id ?? "__none";
      if (!map.has(key)) map.set(key, { id: key, name: r.category?.name ?? "미분류", color: r.category?.color ?? "#8b95a1", order: r.category?.order ?? 999, items: [] });
      map.get(key)!.items.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [resources]);

  // 카테고리 접기/펼치기 — 기본은 선택 장비가 든 그룹만 펼침
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const sel = resources.find((r) => r.id === selected);
    return new Set([sel?.category?.id ?? "__none"]);
  });
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allOpen = groups.length > 0 && groups.every((g) => openGroups.has(g.id));

  const fmt = (d: string) =>
    new Date(d).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  if (resources.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-faint)" }}>
        등록된 자원이 없습니다. 관리자가 자원을 등록하면 여기서 예약할 수 있어요.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "1fr", maxWidth: view === "timeline" ? 1080 : 860 }}>
      {/* 뷰 전환 */}
      <div className="seg" role="tablist" aria-label="보기 전환" style={{ alignSelf: "start" }}>
        <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>리스트</button>
        <button className={view === "timeline" ? "on" : ""} onClick={() => setView("timeline")}>타임라인</button>
      </div>

      {/* 장비 선택 — 분류별 그룹 (리스트 뷰) */}
      {view === "list" && (
        <div className="card" style={{ padding: 16 }}>
          {groups.length > 1 && (
            <div className="rsv-toolbar">
              <button
                type="button"
                className="rsv-linkbtn"
                onClick={() => setOpenGroups(allOpen ? new Set() : new Set(groups.map((g) => g.id)))}
              >
                {allOpen ? "모두 접기" : "모두 펼치기"}
              </button>
            </div>
          )}
          {groups.map((g) => {
            const open = openGroups.has(g.id);
            const selInGroup = g.items.find((r) => r.id === selected);
            return (
              <div className={`rsv-group${open ? " open" : ""}`} key={g.id}>
                <button type="button" className="rsv-group-head" onClick={() => toggleGroup(g.id)} aria-expanded={open}>
                  <span className="rsv-caret" aria-hidden>▸</span>
                  <span className="dot" style={{ background: g.color, width: 9, height: 9 }} />
                  {g.name} <span className="kb-count">{g.items.length}</span>
                  {!open && selInGroup && <span className="rsv-sel-tag">{selInGroup.name}</span>}
                </button>
                {open && (
                  <div className="rsv-chips">
                    {g.items.map((r) => (
                      <button
                        key={r.id}
                        className={`chip chip-btn${selected === r.id ? " sel" : ""}`}
                        onClick={() => setSelected(r.id)}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {/* 선택한 장비의 관리 팀·담당자 — 수령·반납 문의처 */}
          {(() => {
            const sel = resources.find((r) => r.id === selected);
            if (!sel?.ownerTeam) return null;
            return (
              <p className="rsv-owner">
                <span className="dot" style={{ background: sel.ownerTeam.color }} />
                <b>{sel.name}</b> 관리: {sel.ownerTeam.name}{sel.manager ? ` · ${sel.manager.name}` : ""}
              </p>
            );
          })()}
        </div>
      )}

      {/* 예약 폼 */}
      {reservableTeams.length > 0 ? (
        <div className="card" style={{ padding: 22 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>예약하기</h2>
          <p className="rsv-form-hint">
            기간으로 빌릴 수 있어요 · 현재 <b>{rentalDays >= 1 ? `${rentalDays}일 대여` : "기간 오류"}</b>
            {rentalDays === 1 && " (하루)"}
          </p>
          <form onSubmit={reserve}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <div className="field">
                <label>팀</label>
                <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                  {reservableTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>시작일</label>
                <input
                  type="date" value={form.startDate} required
                  onChange={(e) => {
                    const v = e.target.value;
                    // 종료일이 시작일보다 앞서지 않게 같이 밀어준다
                    setForm((f) => ({ ...f, startDate: v, endDate: f.endDate < v ? v : f.endDate }));
                  }}
                />
              </div>
              <div className="field">
                <label>종료일 (반납일)</label>
                <input type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
              </div>
              <div className="field">
                <label>수령 시각</label>
                <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
              </div>
              <div className="field">
                <label>반납 시각</label>
                <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
              </div>
            </div>
            <div className="field">
              <label>메모 (선택)</label>
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="예: 신제품 화보 촬영" />
            </div>
            {err && <p className="err-msg">{err}</p>}
            {ok && <p className="ok-msg">{ok}</p>}
            <button className="btn btn-primary" disabled={busy}>{busy ? "예약 중…" : "예약"}</button>
          </form>
        </div>
      ) : (
        <div className="card" style={{ padding: 18, color: "var(--ink-faint)", fontSize: 14 }}>
          예약 권한이 없습니다. (팀장·부팀장·과장·부과장만 예약 가능)
        </div>
      )}

      {/* 타임라인 뷰 — 그 주 전체 예약 (자원명·팀 색상) */}
      {view === "timeline" && (
        <div className="card cal-card" style={{ padding: 14 }}>
          <FullCalendar
            plugins={[timeGridPlugin]}
            initialView="timeGridWeek"
            locale={koLocale}
            height="auto"
            headerToolbar={{ left: "title", right: "prev,today,next" }}
            buttonText={{ today: "오늘" }}
            allDaySlot
            allDayText="기간"
            slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            scrollTime="08:00:00"
            nowIndicator
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            events={weekEvents}
            datesSet={(arg) => fetchWeek(arg.startStr, arg.endStr)}
            eventClick={(arg) => onTimelineClick(arg.event.extendedProps.resId, arg.event.extendedProps.byId, arg.event.extendedProps.byName, arg.event.extendedProps.returned)}
            noEventsContent="이 주에 예약이 없습니다"
          />
          <p className="rsv-tip">예약을 클릭하면 상세를 볼 수 있어요. (본인 예약은 취소 가능)</p>
        </div>
      )}

      {/* 예약 현황 (리스트 뷰) */}
      {view === "list" && (
      <div className="card" style={{ padding: 8 }}>
        {list.length === 0 ? (
          <p style={{ padding: 24, textAlign: "center", color: "var(--ink-faint)", fontSize: 14 }}>
            예약이 없습니다. 첫 예약을 해보세요!
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>기간</th><th>상태</th><th>팀</th><th>예약자</th><th>메모</th><th /></tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const st = rsvState(r);
                return (
                <tr key={r.id} className={st === "returned" ? "rsv-row-done" : undefined}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                    {fmt(r.startAt)} ~ {fmt(r.endAt)}
                    {(() => {
                      const d = Math.ceil((new Date(r.endAt).getTime() - new Date(r.startAt).getTime()) / 86400_000);
                      return d >= 2 ? <span className="rsv-days">{d}일</span> : null;
                    })()}
                  </td>
                  <td>
                    <span className={`rsv-st rsv-st-${st}`} title={st === "returned" && r.returnedAt ? `반납: ${fmt(r.returnedAt)}${r.returnedByName ? ` · ${r.returnedByName}` : ""}` : undefined}>
                      {st === "overdue" && "⚠ "}{STATE_LABEL[st]}
                    </span>
                  </td>
                  <td>
                    {r.team && (
                      <span className="chip">
                        <span className="dot" style={{ background: r.team.color }} />
                        {r.team.name}
                      </span>
                    )}
                  </td>
                  <td style={{ color: "var(--ink-soft)" }}>{r.reservedBy?.name}</td>
                  <td style={{ color: "var(--ink-soft)", fontSize: 13 }}>{r.note}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {st === "upcoming" && (r.reservedBy?.id === user?.id || user?.role === "admin") && (
                      <button className="btn btn-danger btn-sm" onClick={() => cancel(r.id)}>취소</button>
                    )}
                    {(st === "inuse" || st === "overdue") && canReturnUi(r) && (
                      <button className="btn btn-primary btn-sm" onClick={() => markReturned(r.id)}>반납</button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  );
}
