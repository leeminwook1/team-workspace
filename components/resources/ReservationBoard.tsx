"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type ResourceOpt = { id: string; name: string; category: string };
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

const CATEGORY_LABEL: Record<string, string> = {
  studio: "🎬 스튜디오", camera: "📷 촬영장비", venue: "🎭 공연장",
  audio: "🎙️ 음향장비", edit: "🖥️ 편집실", etc: "📦 기타",
};

export default function ReservationBoard({
  resources, teams,
}: {
  resources: ResourceOpt[]; teams: TeamOpt[];
}) {
  const { data: session } = useSession();
  const user = session?.user;

  const [selected, setSelected] = useState(resources[0]?.id ?? "");
  const [list, setList] = useState<ReservationItem[]>([]);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  // 예약 가능한 팀 (팀장·부팀장 소속팀 / 전사 편집자는 전체)
  const isOrgEditor = ["admin", "manager", "deputy"].includes(user?.orgRole ?? "");
  const reservableTeams = useMemo(() => {
    if (!user) return [];
    if (isOrgEditor) return teams;
    return teams.filter((t) =>
      user.teams?.some((m) => m.teamId === t.id && (m.role === "leader" || m.role === "vice_leader"))
    );
  }, [teams, user, isOrgEditor]);

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
    if (!confirm("이 예약을 취소할까요?")) return;
    const res = await fetch(`/api/reservations/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setErr(data.error ?? "취소 실패"); return; }
    load(selected);
  }

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
    <div style={{ display: "grid", gap: 18, gridTemplateColumns: "1fr", maxWidth: 860 }}>
      {/* 자원 선택 칩 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {resources.map((r) => (
          <button
            key={r.id}
            className="chip"
            style={{
              cursor: "pointer",
              background: selected === r.id ? "var(--accent-soft)" : undefined,
              borderColor: selected === r.id ? "var(--primary)" : undefined,
              color: selected === r.id ? "var(--primary)" : undefined,
            }}
            onClick={() => setSelected(r.id)}
          >
            {CATEGORY_LABEL[r.category]?.split(" ")[0] ?? "📦"} {r.name}
          </button>
        ))}
      </div>

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
            {err && <p className="err-msg">⚠️ {err}</p>}
            {ok && <p className="ok-msg">✅ {ok}</p>}
            <button className="btn btn-primary" disabled={busy}>{busy ? "예약 중…" : "예약"}</button>
          </form>
        </div>
      ) : (
        <div className="card" style={{ padding: 18, color: "var(--ink-faint)", fontSize: 14 }}>
          예약 권한이 없습니다. (팀장·부팀장·과장·부과장만 예약 가능)
        </div>
      )}

      {/* 예약 현황 */}
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
                    {(r.reservedBy?.id === user?.id || user?.orgRole === "admin") && (
                      <button className="btn btn-danger btn-sm" onClick={() => cancel(r.id)}>취소</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
