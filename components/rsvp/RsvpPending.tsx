"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAutoRefresh } from "@/components/useAutoRefresh";

// 홈 — 내가 아직 참석 여부를 답하지 않은 모임. 버튼으로 바로 응답 (없으면 아무것도 안 보임)
type Item = { id: string; title: string; startDate: string; allDay: boolean; location: string; deadline: string | null };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
function when(it: Item) {
  const d = new Date(it.startDate);
  const base = `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
  return it.allDay ? base : `${base} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function RsvpPending() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/rsvp/pending").catch(() => null);
    if (res?.ok) setItems((await res.json()).items ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, ["task"]);

  async function answer(it: Item, status: "yes" | "no" | "maybe") {
    setBusy(it.id);
    const res = await fetch(`/api/tasks/${it.id}/rsvp`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).catch(() => null);
    setBusy(null);
    if (res?.ok) setDone((d) => ({ ...d, [it.id]: status === "yes" ? "✅ 참석" : status === "no" ? "❌ 불참" : "🤔 미정" }));
  }

  if (items.length === 0) return null;
  return (
    <section className="card rp" aria-label="응답이 필요한 모임">
      <h2 className="rp-title">🙋 참석 여부를 알려주세요 <span className="kb-count">{items.filter((x) => !done[x.id]).length}</span></h2>
      <div className="rp-list">
        {items.map((it) => (
          <div className="rp-item" key={it.id}>
            <Link href={`/calendar?task=${it.id}`} className="rp-main">
              <b>{it.title}</b>
              <span>{when(it)}{it.location && ` · ${it.location}`}</span>
            </Link>
            {done[it.id] ? (
              <span className="rp-done">{done[it.id]}으로 응답했어요 · <Link href={`/calendar?task=${it.id}`}>바꾸기</Link></span>
            ) : (
              <div className="rp-btns">
                <button className="btn btn-primary btn-sm" disabled={busy === it.id} onClick={() => answer(it, "yes")}>참석</button>
                <button className="btn btn-line btn-sm" disabled={busy === it.id} onClick={() => answer(it, "no")}>불참</button>
                <button className="btn btn-ghost btn-sm" disabled={busy === it.id} onClick={() => answer(it, "maybe")}>미정</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
