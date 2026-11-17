"use client";

import { useCallback, useEffect, useState } from "react";
import { DateField } from "@/components/DateTimePicker";
import { useConfirm } from "@/components/ConfirmProvider";

// 일정 상세의 "참석 확인" — 내 응답 버튼, 현황 막대, 명단(응답별), 마감·재알림 (관리자)
type Status = "yes" | "no" | "maybe";
type Summary = { on: boolean; allYes: boolean; deadline: string | null; total: number; yes: number; no: number; maybe: number; none: number; isTarget: boolean; mine: Status | null };
type Person = { id: string; name: string; status: Status | null; reason: string };

const LABEL: Record<Status, string> = { yes: "참석", no: "불참", maybe: "미정" };
const EMOJI: Record<Status, string> = { yes: "✅", no: "❌", maybe: "🤔" };
const KST = 9 * 3600_000;
const kstDay = (v: string | null) => (v ? new Date(new Date(v).getTime() + KST).toISOString().slice(0, 10) : "");

export default function RsvpPanel({ taskId, initialOn, canEdit, onChanged }: {
  taskId: string; initialOn: boolean; canEdit: boolean; onChanged?: () => void;
}) {
  const confirm = useConfirm();
  const [sum, setSum] = useState<Summary | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [loaded, setLoaded] = useState(!initialOn);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [reason, setReason] = useState("");
  const [meId, setMeId] = useState<string | null>(null);

  const apply = (d: any) => {
    setSum(d.summary ?? null);
    setPeople(d.people ?? []);
  };
  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/rsvp`).catch(() => null);
    if (res?.ok) apply(await res.json());
    setLoaded(true);
  }, [taskId]);
  useEffect(() => { if (initialOn) load(); }, [initialOn, load]);
  useEffect(() => {
    fetch("/api/auth/session").then((r) => r.json()).then((s) => setMeId(s?.user?.id ?? null)).catch(() => {});
  }, []);
  // 내 기존 사유를 입력칸에 채움
  useEffect(() => {
    const me = people.find((p) => p.id === meId);
    if (me) setReason(me.reason ?? "");
  }, [people, meId]);

  async function call(method: "POST" | "PATCH", body: any) {
    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await fetch(`/api/tasks/${taskId}/rsvp`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(d.error ?? "처리하지 못했어요."); return null; }
      apply(d);
      onChanged?.();
      return d;
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  if (!sum) {
    return canEdit ? (
      <button type="button" className="task-prog-add" disabled={busy}
        onClick={async () => {
          const ok = await confirm({ title: "참석 확인 받기", message: "과원 전체에게 참석 여부를 묻는 알림(텔레그램 포함)을 보낼까요?", confirmText: "보내기" });
          if (ok) { const d = await call("PATCH", { on: true }); if (d) setMsg(`${d.sent}명에게 알림을 보냈어요.`); }
        }}>
        <span aria-hidden>🙋</span> 참석 확인 받기 <em>(과원 전체에게 참석·불참 묻기)</em>
      </button>
    ) : null;
  }

  const pct = (n: number) => (sum.total ? `${(n / sum.total) * 100}%` : "0%");
  const groups: [Status | null, string][] = [["yes", "참석"], ["no", "불참"], ["maybe", "미정"], [null, "미응답"]];
  const needReason = sum.mine === "no" || sum.mine === "maybe";

  return (
    <div className="rsvp-panel">
      <div className="ps-head">
        <div className="detail-status-label" style={{ margin: 0 }}>참석 확인{!sum.on && <span className="rsvp-closed">마감됨</span>}</div>
        {canEdit && (sum.on ? (
          <button type="button" className="rsv-linkbtn" disabled={busy}
            onClick={async () => {
              const ok = await confirm({ title: "참석 확인 마감", message: "참석 확인을 마감할까요? 더 이상 응답을 받지 않아요. 받은 응답은 그대로 보이고, 다시 켜면 이어져요.", confirmText: "마감" });
              if (ok) call("PATCH", { on: false });
            }}>마감하기</button>
        ) : (
          <button type="button" className="rsv-linkbtn" disabled={busy}
            onClick={async () => { const d = await call("PATCH", { on: true }); if (d) setMsg(d.sent ? `미응답 ${d.sent}명에게 다시 물어봤어요.` : "다시 켰어요."); }}>다시 켜기</button>
        ))}
      </div>

      {sum.allYes && <p className="rsvp-allyes">🎉 전원 참석 ({sum.total}명)</p>}

      {sum.on && sum.isTarget && (
        <div className="rsvp-mine">
          <div className="seg rsvp-seg" role="radiogroup" aria-label="내 응답">
            {(["yes", "no", "maybe"] as Status[]).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={sum.mine === s} disabled={busy}
                className={`${sum.mine === s ? "on" : ""} rsvp-opt-${s}`} onClick={() => call("POST", { status: s, reason })}>
                {EMOJI[s]} {LABEL[s]}
              </button>
            ))}
          </div>
          {!sum.mine && <p className="rsvp-hint">아직 응답하지 않았어요.</p>}
          {needReason && (
            <div className="rsvp-reason">
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200}
                placeholder={sum.mine === "no" ? "불참 사유 (선택)" : "메모 (선택) — 예: 늦게 도착"} />
              <button type="button" className="btn btn-line btn-sm" disabled={busy}
                onClick={() => call("POST", { status: sum.mine, reason })}>저장</button>
            </div>
          )}
        </div>
      )}

      <div className="rsvp-bar" role="img" aria-label={`참석 ${sum.yes}, 불참 ${sum.no}, 미정 ${sum.maybe}, 미응답 ${sum.none}`}>
        {sum.yes > 0 && <span className="rsvp-yes" style={{ width: pct(sum.yes) }} />}
        {sum.no > 0 && <span className="rsvp-no" style={{ width: pct(sum.no) }} />}
        {sum.maybe > 0 && <span className="rsvp-maybe" style={{ width: pct(sum.maybe) }} />}
      </div>
      <div className="rsvp-counts">
        <span><i className="rsvp-dot rsvp-yes" />참석 <b>{sum.yes}</b></span>
        <span><i className="rsvp-dot rsvp-no" />불참 <b>{sum.no}</b></span>
        <span><i className="rsvp-dot rsvp-maybe" />미정 <b>{sum.maybe}</b></span>
        <span><i className="rsvp-dot rsvp-none" />미응답 <b>{sum.none}</b></span>
        <span className="rsvp-total">/ {sum.total}명</span>
      </div>

      <div className="rsvp-groups">
        {groups.map(([s, label]) => {
          const list = people.filter((p) => p.status === s);
          if (list.length === 0) return null;
          return (
            <div className="rsvp-group" key={label}>
              <div className="rsvp-group-label">{label} {list.length}</div>
              <div className="rsvp-names">
                {list.map((p) => (
                  <span key={p.id} className={`rsvp-name${s ? ` rsvp-name-${s}` : ""}`} title={p.reason || undefined}>
                    {p.name}{p.reason && <em> · {p.reason}</em>}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {sum.on && <div className="ps-due">
        응답 마감
        {canEdit ? (
          <DateField variant="inline" short clearable placeholder="없음" aria-label="응답 마감" value={kstDay(sum.deadline)} disabled={busy}
            onChange={(v) => call("PATCH", { deadline: v ? new Date(`${v}T23:59:00+09:00`).toISOString() : null })} />
        ) : <b>{sum.deadline ? kstDay(sum.deadline).slice(5).replace("-", "/") : "없음"}</b>}
        {canEdit && sum.none > 0 && (
          <button type="button" className="btn btn-line btn-sm rsvp-remind" disabled={busy}
            onClick={async () => { const d = await call("PATCH", { remind: true }); if (d) setMsg(`${d.sent}명에게 다시 알렸어요.`); }}>
            미응답 {sum.none}명에게 다시 알림
          </button>
        )}
      </div>}
      {msg && <p className="rsvp-msg">{msg}</p>}
      {err && <p className="err-msg" style={{ marginTop: 6 }}>{err}</p>}
    </div>
  );
}
