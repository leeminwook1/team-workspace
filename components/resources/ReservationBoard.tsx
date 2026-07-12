"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import koLocale from "@fullcalendar/core/locales/ko";
import { useConfirm } from "@/components/ConfirmProvider";

type ResourceOpt = {
  id: string; name: string;
  category: { id: string; name: string; color?: string; order: number } | null;
  ownerTeam?: { name: string; color: string } | null; // 관리 팀
  manager?: { name: string } | null; // 관리 담당자
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
    const res = await fetch(`/api/reservations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!res.ok) return;
    const data = await res.json();
    setWeekEvents((data.reservations ?? []).map((r: ReservationItem) => {
      const color = r.team?.color ?? "#8b95a1";
      return {
        id: r.id, title: `${r.resource?.name ?? "?"}${r.team ? ` · ${r.team.name}` : ""}`,
        start: r.startAt, end: r.endAt,
        backgroundColor: color + "26", borderColor: color, textColor: color,
        extendedProps: { resId: r.id, byId: r.reservedBy?.id, byName: r.reservedBy?.name ?? "?" },
      };
    }));
  }, []);

  // 예약 가능한 팀 (팀장·부팀장 소속팀 / 전사 편집자는 전체)
  const isOrgEditor = ["admin", "manager", "deputy", "secretary"].includes(user?.role ?? "");
  const canReserveOwn = user?.role === "leader" || user?.role === "vice_leader";
  const reservableTeams = useMemo(() => {
    if (!user) return [];
    if (isOrgEditor) return teams;
    if (canReserveOwn && user.teamId) return teams.filter((t) => t.id === user.teamId);
    return [];
  }, [teams, user, isOrgEditor, canReserveOwn]);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    teamId: "", date: today, startTime: "10:00", endTime: "12:00", note: "",
  });

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
    const res = await fetch(
      `/api/reservations?resource=${resourceId}&from=${from.toISOString()}&to=${to.toISOString()}`
    );
    if (res.ok) {
      const data = await res.json();
      setList(data.reservations ?? []);
    }
  }, []);

  useEffect(() => { load(selected); }, [selected, load]);

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
        startAt: `${form.date}T${form.startTime}:00`,
        endAt: `${form.date}T${form.endTime}:00`,
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

  // 타임라인에서 예약 클릭 — 본인·admin이면 취소, 아니면 예약자 안내
  async function onTimelineClick(resId: string, byId?: string, byName?: string) {
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
          {groups.map((g) => (
            <div className="rsv-group" key={g.id}>
              <div className="rsv-group-head">
                <span className="dot" style={{ background: g.color, width: 9, height: 9 }} />
                {g.name} <span className="kb-count">{g.items.length}</span>
              </div>
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
            </div>
          ))}
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
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>예약하기</h2>
          <form onSubmit={reserve}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <div className="field">
                <label>팀</label>
                <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                  {reservableTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>날짜</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="field">
                <label>시작</label>
                <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
              </div>
              <div className="field">
                <label>종료</label>
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
            allDaySlot={false}
            slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            scrollTime="08:00:00"
            nowIndicator
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            events={weekEvents}
            datesSet={(arg) => fetchWeek(arg.startStr, arg.endStr)}
            eventClick={(arg) => onTimelineClick(arg.event.extendedProps.resId, arg.event.extendedProps.byId, arg.event.extendedProps.byName)}
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
              <tr><th>기간</th><th>팀</th><th>예약자</th><th>메모</th><th /></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                    {fmt(r.startAt)} ~ {fmt(r.endAt)}
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
                  <td>
                    {(r.reservedBy?.id === user?.id || user?.role === "admin") && (
                      <button className="btn btn-danger btn-sm" onClick={() => cancel(r.id)}>취소</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  );
}
