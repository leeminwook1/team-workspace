"use client";
import { DateField, TimeField } from "@/components/DateTimePicker";
import { ModalClose } from "@/components/ModalClose";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { LoadError } from "@/components/LoadError";
import { useAutoRefresh } from "@/components/useAutoRefresh";

type Team = { id: string; name: string; color: string };
type EventSummary = {
  id: string;
  title: string;
  teams: Team[];
  eventDate: string | null;
  location: string;
  meetTime: string;
  positionsTotal: number;
  myPositions: string[];
  itemsTotal: number;
  itemsDone: number;
  closedAt: string | null;
};

function ddayOf(iso: string | null) {
  if (!iso) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return { label: "D-DAY", tone: "urgent" as const };
  if (diff > 0) return { label: `D-${diff}`, tone: (diff <= 3 ? "urgent" : diff <= 14 ? "soon" : "far") as "urgent" | "soon" | "far" };
  return { label: `D+${-diff}`, tone: "past" as const };
}
function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) : "";
}

export default function EventList({ teams, canManage }: { teams: Team[]; canManage: boolean }) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [loadErr, setLoadErr] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      if (!res.ok) throw new Error(String(res.status));
      setEvents((await res.json()).events ?? []);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, ["event"]); // 다른 사람 변경 자동 반영

  return (
    <div className="events">
      <div className="page-head">
        <div>
          <h1 className="page-title">행사 관리</h1>
          <p className="page-sub">행사를 누르면 알아야 할 내용·포지션·식순·할 일을 한 화면에서 봐요.</p>
        </div>
        {canManage && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={16} strokeWidth={2.4} /> 행사 추가
          </button>
        )}
      </div>

      {loading ? (
        <p className="muted-note">불러오는 중…</p>
      ) : loadErr ? (
        <LoadError onRetry={() => { setLoading(true); load(); }} />
      ) : events.length === 0 ? (
        <p className="muted-note">아직 등록된 행사가 없습니다.</p>
      ) : (
        (() => {
          // 종료(보관)된 행사와 지난 행사(행사일이 지난 것)는 아래 섹션으로 분리
          const t0 = new Date(); t0.setHours(0, 0, 0, 0);
          const isPast = (ev: EventSummary) => !!ev.eventDate && new Date(ev.eventDate).getTime() < t0.getTime();
          const closed = events.filter((e) => e.closedAt);
          const active = events.filter((e) => !e.closedAt);
          const ongoing = active.filter((e) => !isPast(e));
          const past = active.filter(isPast);
          const renderCard = (ev: EventSummary) => {
            const dday = ddayOf(ev.eventDate);
            const pct = ev.itemsTotal ? Math.round((ev.itemsDone / ev.itemsTotal) * 100) : 0;
            const allDone = ev.itemsTotal > 0 && ev.itemsDone === ev.itemsTotal;
            return (
              <Link href={`/events/${ev.id}`} key={ev.id} className="ev-item">
                <div className="ev-item-top">
                  {dday && <span className={`kb-dday ${dday.tone}`}>{dday.label}</span>}
                  {ev.myPositions.length > 0 && <span className="ev-mypos">🎯 내 포지션 · {ev.myPositions.join(", ")}</span>}
                </div>
                <div className="ev-item-title">{ev.title}</div>
                <div className="ev-item-meta">
                  {ev.eventDate && <span>{fmtDate(ev.eventDate)}</span>}
                  {ev.meetTime && <span>· 집합 {ev.meetTime}</span>}
                  {ev.location && <span>· {ev.location}</span>}
                  {ev.positionsTotal > 0 && <span>· 포지션 {ev.positionsTotal}</span>}
                </div>
                <div className="ev-item-foot">
                  <div className="kb-check-bar"><span style={{ width: `${pct}%` }} /></div>
                  {ev.itemsTotal ? (
                    <span className={`ev-item-count${allDone ? " done" : ""}`}>
                      {allDone ? "완료" : <><b>{pct}%</b> · {ev.itemsDone}/{ev.itemsTotal}</>}
                    </span>
                  ) : (
                    <span className="ev-item-count">할 일 없음</span>
                  )}
                </div>
              </Link>
            );
          };
          return (
            <>
              <div className="ev-grid">{ongoing.map(renderCard)}</div>
              {ongoing.length === 0 && <p className="muted-note">진행 중인 행사가 없습니다.</p>}
              {past.length > 0 && (
                <>
                  <div className="admin-section-title" style={{ marginTop: 28 }}>지난 행사 {past.length}</div>
                  <div className="ev-grid ev-grid-past">{past.map(renderCard)}</div>
                </>
              )}
              {closed.length > 0 && (
                <>
                  <div className="admin-section-title" style={{ marginTop: 28 }}>종료된 행사 {closed.length}</div>
                  <div className="ev-grid ev-grid-past">{closed.map(renderCard)}</div>
                </>
              )}
            </>
          );
        })()
      )}

      {createOpen && (
        <EventFormModal teams={teams} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />
      )}
    </div>
  );
}

export function EventFormModal({
  teams, ev, onClose, onSaved,
}: {
  teams: Team[]; ev?: any; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!ev;
  const toDate = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10) : "");
  const [title, setTitle] = useState(ev?.title ?? "");
  const [eventDate, setEventDate] = useState(toDate(ev?.eventDate ?? null));
  const [location, setLocation] = useState(ev?.location ?? "");
  const [meetTime, setMeetTime] = useState(ev?.meetTime ?? "");
  const [meetPlace, setMeetPlace] = useState(ev?.meetPlace ?? "");
  const [dress, setDress] = useState(ev?.brief?.dress ?? "");
  const [caution, setCaution] = useState(ev?.brief?.caution ?? "");
  const [delivery, setDelivery] = useState(ev?.brief?.delivery ?? "");
  const [contact, setContact] = useState(ev?.brief?.contact ?? "");
  const [description, setDescription] = useState(ev?.description ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  void teams;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    // 네트워크 오류·비정상(비-JSON) 응답에도 항상 로딩을 풀고 오류를 표시한다.
    try {
      const res = await fetch(isEdit ? `/api/events/${ev.id}` : "/api/events", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, eventDate: eventDate || null, location, meetTime, meetPlace, description,
          brief: { dress, caution, delivery, contact },
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
      onSaved();
    } catch {
      setErr("네트워크 오류로 저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>{isEdit ? "행사 수정" : "행사 추가"}</h2>
        <form onSubmit={save}>
          <div className="field">
            <label>행사명</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026 연말 행사" required />
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>행사일</label>
              <DateField value={eventDate} onChange={(v) => setEventDate(v)} clearable placeholder="날짜 미정" />
            </div>
            <div className="field">
              <label>장소</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예: 6층 대강당" />
            </div>
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>집합 시간</label>
              <TimeField value={meetTime} onChange={(v) => setMeetTime(v)} placeholder="정하지 않음" />
            </div>
            <div className="field">
              <label>집합 장소</label>
              <input value={meetPlace} onChange={(e) => setMeetPlace(e.target.value)} placeholder="예: 6층 로비" maxLength={120} />
            </div>
          </div>

          <div className="evf-section">📌 알아야 할 내용 <em>비워둔 항목은 표시되지 않아요</em></div>
          <div className="field">
            <label>촬영 주의</label>
            <textarea value={caution} onChange={(e) => setCaution(e.target.value)} maxLength={1000} rows={2}
              placeholder="예: 예배 중 플래시 금지 / 강단 위 진입 불가 / 2부 시작 전 셔터음 무음" />
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label>복장</label>
              <input value={dress} onChange={(e) => setDress(e.target.value)} maxLength={300} placeholder="예: 검정 상하의, 운동화 금지" />
            </div>
            <div className="field">
              <label>현장 연락처</label>
              <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={300} placeholder="예: 진행팀 홍길동 010-0000-0000" />
            </div>
          </div>
          <div className="field">
            <label>납품</label>
            <input value={delivery} onChange={(e) => setDelivery(e.target.value)} maxLength={500} placeholder="예: 12/22까지 · 셀렉 50컷 · JPG 장변 3000px" />
          </div>
          <div className="field">
            <label>자유 메모</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="그 밖에 알아둘 것" />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? "저장 중…" : isEdit ? "저장" : "등록"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
