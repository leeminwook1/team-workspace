"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAutoRefresh } from "@/components/useAutoRefresh";
import { ModalClose } from "@/components/ModalClose";
import { Icon } from "@/components/icons";

type ResourceOpt = {
  id: string; name: string;
  category: { id: string; name: string; color?: string; order: number } | null;
  ownerTeam?: { name: string; color: string } | null; // 관리 팀
  manager?: { id: string; name: string } | null; // 관리 담당자
  status?: "available" | "maintenance" | "broken"; // 장비 상태 (available 외 예약 불가)
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
const STATE_ORDER: RsvState[] = ["overdue", "inuse", "upcoming", "returned"]; // 정렬 우선순위

export default function ReservationBoard({
  resources, teams,
}: {
  resources: ResourceOpt[]; teams: TeamOpt[];
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const confirm = useConfirm();

  const [list, setList] = useState<ReservationItem[]>([]);
  const [err, setErr] = useState("");
  const [view, setView] = useState<"rtl" | "list">("rtl"); // 기본은 장비별 타임라인
  const [modalOpen, setModalOpen] = useState(false);
  // 예약 모달 초기값 — 타임라인 빈 트랙 클릭 시 그 장비·그 날짜·그 시각으로 바로 열기
  const [modalInit, setModalInit] = useState<{ resourceIds?: string[]; startDate?: string; startTime?: string } | null>(null);
  const [editing, setEditing] = useState<ReservationItem | null>(null); // 수정 중인 예약
  const [tlGroup, setTlGroup] = useState<ReservationItem[] | null>(null); // 예약 상세(묶음) 모달
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set()); // 리스트 묶음 펼침

  // ── 장비별 타임라인 (하루 · 시간축 07~23시) ──
  const todayYmd = useMemo(() => {
    const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }, []);
  const HOUR_S = 7, HOUR_E = 23; // 표시 시간창
  const [rtlDate, setRtlDate] = useState<string>(() => {
    const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  const [rtlRaw, setRtlRaw] = useState<ReservationItem[]>([]);
  const [rtlQuery, setRtlQuery] = useState(""); // 장비 이름 검색
  const [rtlClosed, setRtlClosed] = useState<Set<string>>(new Set()); // 접은 분류

  const fetchRtl = useCallback(async () => {
    const from = new Date(rtlDate + "T00:00:00");
    const to = new Date(rtlDate + "T23:59:59");
    try {
      const res = await fetch(`/api/reservations?from=${from.toISOString()}&to=${to.toISOString()}`);
      if (!res.ok) return;
      const d = await res.json();
      setRtlRaw((d.reservations ?? []).filter((r: ReservationItem) => r.status === "booked"));
    } catch {}
  }, [rtlDate]);
  useEffect(() => { fetchRtl(); }, [fetchRtl]);

  // 장비 → 그 날의 예약 목록
  const rtlByResource = useMemo(() => {
    const map = new Map<string, ReservationItem[]>();
    for (const r of rtlRaw) {
      if (!r.resource) continue;
      const arr = map.get(r.resource.id);
      if (arr) arr.push(r); else map.set(r.resource.id, [r]);
    }
    return map;
  }, [rtlRaw]);
  // 분류별 장비 행 (이름 검색 적용)
  const rtlGroups = useMemo(() => {
    const q = rtlQuery.trim().toLowerCase();
    const map = new Map<string, { id: string; name: string; color: string; order: number; items: ResourceOpt[] }>();
    for (const r of resources) {
      if (q && !r.name.toLowerCase().includes(q)) continue;
      const key = r.category?.id ?? "__none";
      if (!map.has(key)) map.set(key, { id: key, name: r.category?.name ?? "미분류", color: r.category?.color ?? "#8b95a1", order: r.category?.order ?? 999, items: [] });
      map.get(key)!.items.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [resources, rtlQuery]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RsvState>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all"); // 종류(분류) 필터
  const [rangeFrom, setRangeFrom] = useState(""); // 기간 필터 (YYYY-MM-DD)
  const [rangeTo, setRangeTo] = useState("");

  // 분류 목록 + 예약 → 분류 매핑
  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color?: string; order: number }>();
    for (const r of resources) if (r.category && !map.has(r.category.id)) map.set(r.category.id, r.category);
    return Array.from(map.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  }, [resources]);
  const resCatId = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of resources) m.set(r.id, r.category?.id ?? "");
    return m;
  }, [resources]);

  // 예약 가능한 팀 (팀 소속이면 팀원 포함 누구나 / 전사 편집자는 전체)
  const isOrgEditor = ["admin", "manager", "deputy", "secretary"].includes(user?.role ?? "");
  const canReserveOwn = ["leader", "vice_leader", "member"].includes(user?.role ?? "");
  const reservableTeams = useMemo(() => {
    if (!user) return [];
    if (isOrgEditor) return teams;
    if (canReserveOwn && user.teamId) return teams.filter((t) => t.id === user.teamId);
    return [];
  }, [teams, user, isOrgEditor, canReserveOwn]);
  const canReserve = reservableTeams.length > 0;

  // 대여 목록 — 기간 필터 지정 시 그 범위, 없으면 어제~60일 뒤 (과거 조회는 기간 필터로)
  const load = useCallback(async () => {
    let fromISO: string, toISO: string;
    if (rangeFrom && rangeTo) {
      fromISO = new Date(rangeFrom + "T00:00:00").toISOString();
      toISO = new Date(rangeTo + "T23:59:59").toISOString();
    } else {
      const from = new Date(); from.setDate(from.getDate() - 1);
      const to = new Date(); to.setDate(to.getDate() + 60);
      fromISO = from.toISOString(); toISO = to.toISOString();
    }
    try {
      const res = await fetch(`/api/reservations?from=${fromISO}&to=${toISO}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setList(data.reservations ?? []);
      setErr("");
    } catch {
      setErr("예약 목록을 불러오지 못했어요. 네트워크 확인 후 새로고침해주세요.");
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => {
    load();
    if (view === "rtl") fetchRtl();
  }, ["reservation"]);

  async function removeReservation(id: string) {
    const confirmed = await confirm({
      title: "예약 삭제", message: "이 예약을 삭제할까요? 목록에서 사라집니다.",
      confirmText: "삭제", cancelText: "닫기", danger: true,
    });
    if (!confirmed) return false;
    const res = await fetch(`/api/reservations/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "삭제 실패"); return false; }
    load();
    fetchRtl();
    return true;
  }

  async function markReturned(id: string) {
    const confirmed = await confirm({
      title: "반납 처리",
      message: "이 장비를 반납 처리할까요? 반납하면 남은 시간에 다른 팀이 예약할 수 있어요.",
      confirmText: "반납 완료", cancelText: "닫기",
    });
    if (!confirmed) return false;
    const res = await fetch(`/api/reservations/${id}/return`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "반납 처리 실패"); return false; }
    setErr(""); load();
    fetchRtl();
    return true;
  }

  const isReturnManager = ["admin", "manager", "deputy"].includes(user?.role ?? "");
  function canReturnUi(r: ReservationItem) {
    if (r.reservedBy?.id === user?.id || isReturnManager) return true;
    const res = resources.find((x) => x.id === r.resource?.id);
    return res?.manager?.id === user?.id;
  }

  // 목록 필터 — 검색어(장비명·예약자·메모) + 상태, 이후 같은 시간·팀·예약자 묶음으로 그룹핑
  const shownGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = list
      .map((r) => ({ r, st: rsvState(r) }))
      .filter(({ r, st }) => {
        if (statusFilter !== "all" && st !== statusFilter) return false;
        if (categoryFilter !== "all" && resCatId.get(r.resource?.id ?? "") !== categoryFilter) return false;
        if (!q) return true;
        return (r.resource?.name ?? "").toLowerCase().includes(q)
          || (r.reservedBy?.name ?? "").toLowerCase().includes(q)
          || (r.note ?? "").toLowerCase().includes(q);
      });
    const map = new Map<string, ReservationItem[]>();
    for (const { r } of filtered) {
      const key = [r.startAt, r.endAt, r.team?.id ?? "", r.reservedBy?.id ?? "", r.status].join("|");
      const arr = map.get(key);
      if (arr) arr.push(r); else map.set(key, [r]);
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({ key, items, st: rsvState(items[0]) }))
      .sort((a, b) =>
        STATE_ORDER.indexOf(a.st) - STATE_ORDER.indexOf(b.st)
        || new Date(a.items[0].startAt).getTime() - new Date(b.items[0].startAt).getTime()
      );
  }, [list, query, statusFilter, categoryFilter, resCatId]);

  const statusCount = (s: RsvState) => list.filter((r) => rsvState(r) === s).length;

  const fmt = (d: string) =>
    new Date(d).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const fmtShort = (d: string) =>
    new Date(d).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  if (resources.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--ink-faint)" }}>
        등록된 자원이 없습니다. 관리자가 자원을 등록하면 여기서 예약할 수 있어요.
      </div>
    );
  }

  return (
    <div className="rsv2">
      {/* 상단 툴바 — 뷰 전환 + 예약 버튼 */}
      <div className="rsv2-topbar">
        <div className="seg" role="tablist" aria-label="보기 전환">
          <button className={view === "rtl" ? "on" : ""} onClick={() => setView("rtl")}>타임라인</button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>대여 내역</button>
        </div>
        {canReserve && (
          <button className="btn btn-primary rsv2-book" onClick={() => { setModalInit(null); setModalOpen(true); }}>
            <Icon name="plus" size={16} strokeWidth={2.5} /> 예약하기
          </button>
        )}
      </div>

      {err && <p className="err-msg">{err}</p>}

      {/* 장비별 타임라인 — 행=장비, 가로=시간(07~23시), 하루 단위 */}
      {view === "rtl" && (() => {
        const dayStart = new Date(rtlDate + "T00:00:00").getTime();
        const winS = dayStart + HOUR_S * 3600_000;
        const winE = dayStart + HOUR_E * 3600_000;
        const winSpan = winE - winS;
        const dayEnd = dayStart + 86_400_000;
        const now = Date.now();
        const nowPct = rtlDate === todayYmd && now >= winS && now <= winE ? ((now - winS) / winSpan) * 100 : null;
        const dObj = new Date(rtlDate + "T00:00:00");
        const dow = ["일", "월", "화", "수", "목", "금", "토"][dObj.getDay()];
        const hourMarks: number[] = [];
        for (let h = HOUR_S; h <= HOUR_E; h += 2) hourMarks.push(h);
        return (
          <>
            <div className="rsv2-filters">
              <div className="rsv2-search">
                <Icon name="search" size={15} />
                <input value={rtlQuery} onChange={(e) => setRtlQuery(e.target.value)} placeholder="장비 이름 검색" aria-label="장비 검색" />
                {rtlQuery && <button className="rsv2-clear" aria-label="지우기" onClick={() => setRtlQuery("")}>×</button>}
              </div>
              <div className="avb-nav">
                <button className="avb-nav-btn" aria-label="이전 날" onClick={() => setRtlDate(addDays(rtlDate, -1))}>‹</button>
                <button className="avb-nav-btn" onClick={() => setRtlDate(todayYmd)}>오늘</button>
                <button className="avb-nav-btn" aria-label="다음 날" onClick={() => setRtlDate(addDays(rtlDate, 1))}>›</button>
                <input type="date" className="rtl-date" value={rtlDate} onChange={(e) => e.target.value && setRtlDate(e.target.value)} aria-label="날짜 선택" />
                <span className="avb-range">{dObj.getMonth() + 1}/{dObj.getDate()} ({dow}){rtlDate === todayYmd ? " · 오늘" : ""}</span>
              </div>
            </div>
            <div className="card rtl-card">
              <div className="rtl-scroll">
                <div className="rtl-inner">
                  {/* 시간축 헤더 */}
                  <div className="rtl-row rtl-headrow">
                    <div className="rtl-res rtl-res-h">장비</div>
                    <div className="rtl-track rtl-track-h">
                      {hourMarks.map((h) => (
                        <span key={h} className="rtl-hour" style={{ left: `${((h - HOUR_S) / (HOUR_E - HOUR_S)) * 100}%` }}>{h}시</span>
                      ))}
                    </div>
                  </div>
                  {rtlGroups.length === 0 && <div className="avb-empty">검색 결과가 없습니다.</div>}
                  {rtlGroups.map((g) => {
                    const closed = rtlClosed.has(g.id);
                    return (
                      <Fragment key={g.id}>
                        <div className="rtl-cat">
                          <button
                            type="button" className="avb-cat-toggle" aria-expanded={!closed}
                            onClick={() => setRtlClosed((prev) => {
                              const next = new Set(prev);
                              if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                              return next;
                            })}
                          >
                            <span className={`rsv-caret${closed ? "" : " open"}`} aria-hidden>▸</span>
                            <span className="dot" style={{ background: g.color }} />
                            {g.name} <span className="kb-count">{g.items.length}</span>
                          </button>
                        </div>
                        {!closed && g.items.map((res) => {
                          const bad = res.status && res.status !== "available";
                          const items = rtlByResource.get(res.id) ?? [];
                          const clickable = canReserve && !bad;
                          return (
                            <div className="rtl-row" key={res.id}>
                              <div className={`rtl-res${bad ? " off" : ""}`}>
                                <span className="avb-res-nm" title={res.name}>{res.name}</span>
                                {bad && <span className={`status-pill ${res.status === "broken" ? "pill-broken" : "pill-maint"}`}>{res.status === "broken" ? "고장" : "수리중"}</span>}
                              </div>
                              <div
                                className={`rtl-track${clickable ? " can" : ""}${bad ? " off" : ""}`}
                                title={bad ? (res.status === "broken" ? "고장" : "수리·점검 중") : clickable ? "빈 곳 클릭 → 이 장비 예약" : undefined}
                                onClick={clickable ? (e) => {
                                  if (e.target !== e.currentTarget) return; // 막대 클릭은 제외
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const h = Math.min(HOUR_E - 1, Math.max(HOUR_S, HOUR_S + Math.floor(((e.clientX - rect.left) / rect.width) * (HOUR_E - HOUR_S))));
                                  setModalInit({ resourceIds: [res.id], startDate: rtlDate, startTime: `${String(h).padStart(2, "0")}:00` });
                                  setModalOpen(true);
                                } : undefined}
                              >
                                {items.map((r) => {
                                  const s0 = new Date(r.startAt).getTime(), e0 = new Date(r.endAt).getTime();
                                  const s = Math.max(s0, winS), e = Math.min(e0, winE);
                                  if (e <= winS || s >= winE) return null; // 표시 창 밖(심야 전용)
                                  const left = ((s - winS) / winSpan) * 100;
                                  const width = Math.min(100 - left, Math.max(3.2, ((e - s) / winSpan) * 100));
                                  const color = r.team?.color ?? "#8b95a1";
                                  const mine = r.reservedBy?.id === user?.id;
                                  const contL = s0 < dayStart, contR = e0 > dayEnd;
                                  return (
                                    <button
                                      key={r.id} type="button"
                                      className={`rtl-bar${mine ? " mine" : ""}${contL ? " cl" : ""}${contR ? " cr" : ""}`}
                                      style={{ left: `${left}%`, width: `${width}%`, background: `color-mix(in srgb, ${color} 16%, transparent)`, borderColor: color, color }}
                                      title={`${r.resource?.name ?? ""} · ${r.reservedBy?.name ?? "?"}${r.team ? ` (${r.team.name})` : ""}\n${fmtShort(r.startAt)} ~ ${fmtShort(r.endAt)}${r.note ? `\n${r.note}` : ""}`}
                                      onClick={(ev) => { ev.stopPropagation(); setTlGroup([r]); }}
                                    >
                                      <span className="rtl-bar-nm">{contL ? "◀ " : ""}{r.reservedBy?.name ?? ""}{contR ? " ▶" : ""}</span>
                                    </button>
                                  );
                                })}
                                {nowPct !== null && <span className="rtl-now" style={{ left: `${nowPct}%` }} aria-hidden />}
                              </div>
                            </div>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
              <p className="rsv-tip">막대 = 예약 (클릭하면 상세·반납·수정) · 빈 곳을 클릭하면 그 장비·그 시각으로 바로 예약 · ◀▶ = 앞뒤 날로 이어지는 기간 대여</p>
            </div>
          </>
        );
      })()}

      {/* 리스트 뷰 */}
      {view === "list" && (
        <>
          <div className="rsv2-filters">
            <div className="rsv2-search">
              <Icon name="search" size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="장비·예약자·메모 검색" aria-label="예약 검색" />
              {query && <button className="rsv2-clear" aria-label="지우기" onClick={() => setQuery("")}>×</button>}
            </div>
            {/* 종류(분류) 필터 */}
            <select className="rsv2-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="종류 필터">
              <option value="all">전체 종류</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {/* 기간 필터 */}
            <div className="rsv2-range">
              <span className="rsv2-range-label">기간</span>
              <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} aria-label="시작일" />
              <span className="rsv2-range-sep">~</span>
              <input type="date" value={rangeTo} min={rangeFrom || undefined} onChange={(e) => setRangeTo(e.target.value)} aria-label="종료일" />
              {(rangeFrom || rangeTo) && <button type="button" className="rsv2-clear" aria-label="기간 초기화" onClick={() => { setRangeFrom(""); setRangeTo(""); }}>×</button>}
            </div>
          </div>

          {/* 상태 필터 칩 */}
          <div className="rsv2-chips">
            <button className={`chip chip-btn${statusFilter === "all" ? " sel" : ""}`} onClick={() => setStatusFilter("all")}>
              전체 <b>{list.length}</b>
            </button>
            {STATE_ORDER.map((s) => {
              const n = statusCount(s);
              if (n === 0) return null;
              return (
                <button key={s} className={`chip chip-btn${statusFilter === s ? " sel" : ""}`} onClick={() => setStatusFilter(s)}>
                  {s === "overdue" && "⚠ "}{STATE_LABEL[s]} <b>{n}</b>
                </button>
              );
            })}
          </div>

          {shownGroups.length === 0 ? (
            <div className="card rsv2-empty">
              {list.length === 0
                ? (rangeFrom && rangeTo ? "이 기간에 예약이 없어요." : "아직 예약이 없어요. 위 예약하기 버튼으로 첫 예약을 해보세요!")
                : "조건에 맞는 예약이 없습니다."}
            </div>
          ) : (
            <div className="rsv2-list">
              {shownGroups.map(({ key, items, st }) => {
                const r = items[0];
                const single = items.length === 1;
                const open = openGroups.has(key);
                const days = Math.ceil((new Date(r.endAt).getTime() - new Date(r.startAt).getTime()) / 86400_000);
                // 본인이 올린 예약 또는 최고관리자 — 삭제는 모든 상태, 수정은 진행 중(반납 전)만
                const isOwnerOrAdmin = r.reservedBy?.id === user?.id || user?.role === "admin";
                const canDelete = isOwnerOrAdmin;
                const canEdit = isOwnerOrAdmin && st !== "returned";
                const canReturn = (st === "inuse" || st === "overdue") && canReturnUi(r);
                return (
                  <div className={`rsv2-item${st === "returned" ? " done" : ""}${single ? "" : " rsv2-item-group"}`} key={key}>
                    <div className="rsv2-item-body">
                      <div className="rsv2-item-top">
                        {single ? (
                          <span className="rsv2-item-name">{r.resource?.name ?? "?"}</span>
                        ) : (
                          <button
                            type="button" className="rsv2-item-name rsv2-group-toggle" aria-expanded={open}
                            onClick={() => setOpenGroups((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key); else next.add(key);
                              return next;
                            })}
                          >
                            장비 {items.length}개 <span className="rsv2-group-arrow" aria-hidden>{open ? "▲" : "▼"}</span>
                          </button>
                        )}
                        <span className={`rsv-st rsv-st-${st}`}>{st === "overdue" && "⚠ "}{STATE_LABEL[st]}</span>
                        {days >= 2 && <span className="rsv-days">{days}일</span>}
                      </div>
                      <div className="rsv2-item-period">{fmtShort(r.startAt)} ~ {fmtShort(r.endAt)}</div>
                      <div className="rsv2-item-meta">
                        {r.team && <span className="chip"><span className="dot" style={{ background: r.team.color }} />{r.team.name}</span>}
                        <span className="rsv2-item-by">{r.reservedBy?.name}</span>
                        {r.note && <span className="rsv2-item-note">· {r.note}</span>}
                        {st === "returned" && r.returnedAt && <span className="rsv2-item-note">· 반납 {fmt(r.returnedAt)}{r.returnedByName ? ` (${r.returnedByName})` : ""}</span>}
                      </div>
                      {!single && !open && (
                        <div className="rsv2-group-preview">
                          {items.map((it) => it.resource?.name ?? "?").slice(0, 4).join(", ")}{items.length > 4 ? ` 외 ${items.length - 4}개` : ""}
                        </div>
                      )}
                      {!single && open && (
                        <div className="rsv2-group-list">
                          {items.map((it) => (
                            <div className="tlg-row" key={it.id}>
                              <span className="tlg-name">{it.resource?.name ?? "?"}</span>
                              <span className="tlg-actions">
                                {canReturn && canReturnUi(it) && <button className="btn btn-primary btn-sm" onClick={() => markReturned(it.id)}>반납</button>}
                                {canEdit && <button className="btn btn-line btn-sm" onClick={() => setEditing(it)}>수정</button>}
                                {canDelete && <button className="btn btn-danger btn-sm" onClick={() => removeReservation(it.id)}>삭제</button>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {single && (canEdit || canDelete || canReturn) && (
                      <div className="rsv2-item-actions">
                        {canReturn && <button className="btn btn-primary btn-sm" onClick={() => markReturned(r.id)}>반납</button>}
                        {canEdit && <button className="btn btn-line btn-sm" onClick={() => setEditing(r)}>수정</button>}
                        {canDelete && <button className="btn btn-danger btn-sm" onClick={() => removeReservation(r.id)}>삭제</button>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 타임라인 묶음 상세 — 같은 시간·예약자의 장비 여러 개 */}
      {tlGroup && tlGroup.length > 0 && (
        <div className="modal-overlay" onClick={() => setTlGroup(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <ModalClose onClose={() => setTlGroup(null)} />
            <h2>{tlGroup.length > 1 ? `장비 ${tlGroup.length}개 예약` : tlGroup[0].resource?.name ?? "예약 상세"}</h2>
            <p className="rsv-form-hint" style={{ marginTop: -8 }}>
              <b>{tlGroup[0].reservedBy?.name ?? "?"}</b>
              {tlGroup[0].team ? ` · ${tlGroup[0].team.name}` : ""} · {fmt(tlGroup[0].startAt)} ~ {fmt(tlGroup[0].endAt)}
              {tlGroup[0].note ? ` · ${tlGroup[0].note}` : ""}
            </p>
            <div className="tlg-list">
              {tlGroup.map((r) => {
                const st = rsvState(r);
                const isOwnerOrAdmin = r.reservedBy?.id === user?.id || user?.role === "admin";
                const canReturn = (st === "inuse" || st === "overdue") && canReturnUi(r);
                return (
                  <div className="tlg-row" key={r.id}>
                    <span className="tlg-name">{r.resource?.name ?? "?"}</span>
                    <span className={`rsv-st rsv-st-${st}`}>{st === "overdue" && "⚠ "}{STATE_LABEL[st]}</span>
                    <span className="tlg-actions">
                      {canReturn && (
                        <button className="btn btn-primary btn-sm" onClick={async () => {
                          if (await markReturned(r.id)) setTlGroup((g) => g?.map((x) => x.id === r.id ? { ...x, status: "returned" as const } : x) ?? null);
                        }}>반납</button>
                      )}
                      {isOwnerOrAdmin && st !== "returned" && (
                        <button className="btn btn-line btn-sm" onClick={() => { setTlGroup(null); setEditing(r); }}>수정</button>
                      )}
                      {isOwnerOrAdmin && (
                        <button className="btn btn-danger btn-sm" onClick={async () => {
                          if (await removeReservation(r.id)) setTlGroup((g) => {
                            const next = g?.filter((x) => x.id !== r.id) ?? [];
                            return next.length > 0 ? next : null;
                          });
                        }}>삭제</button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <ReserveModal
          resources={resources}
          teams={reservableTeams}
          initial={modalInit}
          onClose={() => { setModalOpen(false); setModalInit(null); }}
          onRefresh={() => { load(); fetchRtl(); }}
        />
      )}

      {editing && (
        <EditReservationModal
          resv={editing}
          teams={reservableTeams}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); fetchRtl(); }}
        />
      )}
    </div>
  );
}

/* ── 예약 수정 모달 — 장비는 고정, 기간·팀·메모 수정 ── */
function EditReservationModal({
  resv, teams, onClose, onSaved,
}: {
  resv: ReservationItem; teams: TeamOpt[]; onClose: () => void; onSaved: () => void;
}) {
  const toDate = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const toTime = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
  const [form, setForm] = useState({
    teamId: resv.team?.id ?? teams[0]?.id ?? "",
    startDate: toDate(resv.startAt), endDate: toDate(resv.endAt),
    startTime: toTime(resv.startAt), endTime: toTime(resv.endAt),
    note: resv.note ?? "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const rentalDays = (() => {
    const s = new Date(form.startDate), e = new Date(form.endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    return Math.round((e.getTime() - s.getTime()) / 86400_000) + 1;
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    const res = await fetch(`/api/reservations/${resv.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: form.teamId,
        startAt: `${form.startDate}T${form.startTime}:00`,
        endAt: `${form.endDate}T${form.endTime}:00`,
        note: form.note,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "수정 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>예약 수정</h2>
        <p className="rsv-form-hint" style={{ marginTop: -8 }}>장비 <b>{resv.resource?.name ?? "?"}</b> · 기간·팀·메모를 수정할 수 있어요 (장비 변경은 삭제 후 다시 예약).</p>
        <form onSubmit={submit}>
          <div className="field">
            <label>예약 팀</label>
            <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="rsv2-daterow">
            <div className="field">
              <label>시작일</label>
              <input type="date" value={form.startDate} required
                onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, startDate: v, endDate: f.endDate < v ? v : f.endDate })); }} />
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
          <p className="rsv-form-hint" style={{ margin: "-2px 0 12px" }}>
            <b>{rentalDays >= 1 ? `${rentalDays}일 대여` : "기간 오류"}</b>{rentalDays === 1 && " (하루)"}
          </p>
          <div className="field">
            <label>메모 (선택)</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="예: 신제품 화보 촬영" />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? "저장 중…" : "수정 저장"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── 예약 모달 — 여러 장비 선택(검색+분류) + 기간 대여 ── */
function ReserveModal({
  resources, teams, initial, onClose, onRefresh,
}: {
  resources: ResourceOpt[]; teams: TeamOpt[];
  initial?: { resourceIds?: string[]; startDate?: string; startTime?: string } | null; // 타임라인에서 장비·날짜·시각 지정 진입
  onClose: () => void; onRefresh: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [resIds, setResIds] = useState<Set<string>>(new Set(initial?.resourceIds ?? []));
  const [resQuery, setResQuery] = useState("");
  const [form, setForm] = useState({
    teamId: teams[0]?.id ?? "",
    startDate: initial?.startDate ?? today,
    // 타임라인에서 날짜를 찍고 들어오면 하루 대여가 기본, 일반 진입은 일주일
    endDate: initial?.startDate ?? addDays(today, 6),
    startTime: initial?.startTime ?? "10:00",
    endTime: initial?.startTime && initial.startTime >= "17:00"
      ? `${String(Math.min(23, parseInt(initial.startTime, 10) + 2)).padStart(2, "0")}:00`
      : "18:00",
    note: "",
  });
  const [err, setErr] = useState("");
  const [fails, setFails] = useState<{ name: string; reason: string }[]>([]);
  const [busy, setBusy] = useState(false);
  // 선택한 기간에 이미 예약 중인 장비 — resourceId → 예약자 이름
  const [busyMap, setBusyMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const { startDate, endDate, startTime, endTime } = form;
    if (!startDate || !endDate || endDate < startDate) { setBusyMap(new Map()); return; }
    const from = new Date(`${startDate}T${startTime || "00:00"}:00`);
    const to = new Date(`${endDate}T${endTime || "23:59"}:00`);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) { setBusyMap(new Map()); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reservations?from=${from.toISOString()}&to=${to.toISOString()}`);
        if (!res.ok || !alive) return;
        const data = await res.json();
        const map = new Map<string, string>();
        for (const r of data.reservations ?? []) {
          if (r.status !== "booked" || !r.resource) continue;
          if (!map.has(r.resource.id)) map.set(r.resource.id, r.reservedBy?.name ?? "?");
        }
        if (alive) setBusyMap(map);
      } catch {}
    }, 250); // 날짜 연타 시 요청 몰림 방지
    return () => { alive = false; clearTimeout(t); };
  }, [form.startDate, form.endDate, form.startTime, form.endTime]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRes = (id: string) =>
    setResIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const rentalDays = (() => {
    const s = new Date(form.startDate), e = new Date(form.endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    return Math.round((e.getTime() - s.getTime()) / 86400_000) + 1;
  })();

  // 분류별 그룹 + 검색 필터
  const groups = useMemo(() => {
    const q = resQuery.trim().toLowerCase();
    const map = new Map<string, { id: string; name: string; color: string; order: number; items: ResourceOpt[] }>();
    for (const r of resources) {
      if (q && !r.name.toLowerCase().includes(q)) continue;
      const key = r.category?.id ?? "__none";
      if (!map.has(key)) map.set(key, { id: key, name: r.category?.name ?? "미분류", color: r.category?.color ?? "#8b95a1", order: r.category?.order ?? 999, items: [] });
      map.get(key)!.items.push(r);
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [resources, resQuery]);

  const selectedList = resources.filter((r) => resIds.has(r.id));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setFails([]);
    const ids = Array.from(resIds);
    if (ids.length === 0) { setErr("장비를 하나 이상 선택하세요."); return; }
    setBusy(true);
    // 선택한 장비마다 같은 기간으로 예약 — 병렬 요청 (충돌은 그 장비만 실패로 표시)
    const results = await Promise.all(ids.map(async (id) => {
      const res = await fetch("/api/reservations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId: id, teamId: form.teamId,
          startAt: `${form.startDate}T${form.startTime}:00`,
          endAt: `${form.endDate}T${form.endTime}:00`,
          note: form.note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      return { id, ok: res.ok, reason: data.error ?? "예약 실패" };
    }));
    const failures = results.filter((r) => !r.ok).map((r) => ({
      id: r.id, name: resources.find((x) => x.id === r.id)?.name ?? "장비", reason: r.reason,
    }));
    const okCount = results.length - failures.length;
    setBusy(false);
    onRefresh(); // 성공분은 즉시 목록 반영
    if (failures.length === 0) { onClose(); return; }
    // 일부 실패 — 실패한 장비만 선택으로 남기고 사유 표시
    setResIds(new Set(failures.map((f) => f.id)));
    setFails(failures.map((f) => ({ name: f.name, reason: f.reason })));
    setErr(okCount > 0 ? `${okCount}건 예약 완료. 아래 ${failures.length}건은 예약하지 못했어요.` : "예약하지 못했어요.");
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>장비 예약하기</h2>

        <form onSubmit={submit}>
          {/* 장비 선택 (여러 개) */}
          <div className="field">
            <label>장비 {selectedList.length > 0 && <span className="rsv2-picked">· {selectedList.length}개 선택됨</span>}</label>
            {/* 선택된 장비 요약 칩 (클릭으로 해제) */}
            {selectedList.length > 0 && (
              <div className="rsv2-selected">
                {selectedList.map((r) => (
                  <button type="button" key={r.id} className="rsv2-sel-chip" onClick={() => toggleRes(r.id)}>
                    {r.name} <span aria-hidden>×</span>
                  </button>
                ))}
              </div>
            )}
            <div className="rsv2-picker">
              <div className="rsv2-search in-modal">
                <Icon name="search" size={15} />
                <input value={resQuery} onChange={(e) => setResQuery(e.target.value)} placeholder="장비 이름 검색" aria-label="장비 검색" />
                {resQuery && <button type="button" className="rsv2-clear" aria-label="지우기" onClick={() => setResQuery("")}>×</button>}
              </div>
              <div className="rsv2-picker-list">
                {groups.length === 0 ? (
                  <p className="muted-note" style={{ padding: "8px 4px" }}>검색 결과가 없습니다.</p>
                ) : groups.map((g) => (
                  <div key={g.id} className="rsv2-picker-group">
                    <div className="rsv2-picker-cat"><span className="dot" style={{ background: g.color }} />{g.name} <span className="kb-count">{g.items.length}</span></div>
                    <div className="rsv2-picker-chips">
                      {g.items.map((r) => {
                        const bad = r.status && r.status !== "available";
                        const busyBy = !bad ? busyMap.get(r.id) : undefined;
                        if (bad || busyBy) {
                          return (
                            <span key={r.id} className="chip rsv2-chip-off" title={bad ? (r.status === "broken" ? "고장" : "수리·점검 중") : `${busyBy} 예약 중`}>
                              {r.name}
                              <b className={bad ? "off-bad" : "off-busy"}>{bad ? (r.status === "broken" ? "고장" : "수리중") : `${busyBy} 예약중`}</b>
                            </span>
                          );
                        }
                        return (
                          <button type="button" key={r.id} className={`chip chip-btn${resIds.has(r.id) ? " sel" : ""}`} onClick={() => toggleRes(r.id)}>
                            {resIds.has(r.id) && <span aria-hidden style={{ marginRight: 3 }}>✓</span>}{r.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="rsv2-picker-hint">카메라·렌즈·배터리·메모리처럼 <b>여러 개를 한 번에</b> 골라 같은 기간으로 예약할 수 있어요.</p>
          </div>

          {/* 팀 */}
          <div className="field">
            <label>예약 팀</label>
            <select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* 기간 */}
          <div className="rsv2-daterow">
            <div className="field">
              <label>시작일</label>
              <input type="date" value={form.startDate} required
                onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, startDate: v, endDate: f.endDate < v ? v : f.endDate })); }} />
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
          <p className="rsv-form-hint" style={{ margin: "-2px 0 12px" }}>
            기간으로 빌릴 수 있어요 · <b>{rentalDays >= 1 ? `${rentalDays}일 대여` : "기간 오류"}</b>{rentalDays === 1 && " (하루)"}
          </p>

          <div className="field">
            <label>메모 (선택)</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="예: 신제품 화보 촬영" />
          </div>

          {err && <p className="err-msg">{err}</p>}
          {fails.length > 0 && (
            <ul className="rsv2-fails">
              {fails.map((f, i) => <li key={i}><b>{f.name}</b> — {f.reason}</li>)}
            </ul>
          )}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy || resIds.size === 0}>
              {busy ? "예약 중…" : resIds.size > 1 ? `${resIds.size}개 예약하기` : "예약하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
