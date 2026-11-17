"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/icons";
import { LoadError } from "@/components/LoadError";
import { useAutoRefresh } from "@/components/useAutoRefresh";
import { useConfirm } from "@/components/ConfirmProvider";
import { DateField } from "@/components/DateTimePicker";
import { PIPELINE_STEPS, STEP_KEYS, STEP_LABEL, type PipelineState, type StepKey } from "@/lib/pipeline";

type ColKey = StepKey | "done";
// 열 순서 — 0 촬영 예정 … 4 보고 대기, 5 완료
const colIndex = (k: ColKey) => (k === "done" ? STEP_KEYS.length : STEP_KEYS.indexOf(k));

type Item = {
  id: string; title: string; startDate: string; endDate: string; allDay: boolean; location: string;
  category: { name: string; color: string } | null;
  assignees: { id: string; name: string }[];
  pipeline: PipelineState; next: StepKey | null; canStep: boolean;
};

const DAY = 86_400_000;
const md = (iso: string | Date) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

const daysLeft = (iso: string | Date) => { const d = new Date(iso); d.setHours(0, 0, 0, 0); return Math.round((d.getTime() - startOfToday()) / DAY); };
const kstDay = (v: string | Date | null) => (v ? new Date(new Date(v).getTime() + 9 * 3600_000).toISOString().slice(0, 10) : "");

// 카드 경고 — 보고·셀렉 마감 지남 / 임박, 촬영 끝났는데 백업 안 함 (지연 > 임박, 보고 > 셀렉 순)
function alertOf(it: Item): { text: string; tone: "late" | "soon" } | null {
  if (!it.next) return null;
  const rep = it.pipeline.reportDue ? daysLeft(it.pipeline.reportDue) : null;
  const sel = it.pipeline.selectDue && !it.pipeline.steps.select ? daysLeft(it.pipeline.selectDue) : null;
  if (rep !== null && rep < 0) return { text: `보고 ${-rep}일 지연`, tone: "late" };
  if (sel !== null && sel < 0) return { text: `셀렉 ${-sel}일 지연`, tone: "late" };
  if (rep !== null && rep <= 2) return { text: rep === 0 ? "오늘 보고 마감" : `보고 D-${rep}`, tone: "soon" };
  if (sel !== null && sel <= 1) return { text: sel === 0 ? "오늘 셀렉 마감" : `셀렉 D-${sel}`, tone: "soon" };
  if (it.next === "backup" && Date.now() - new Date(it.endDate).getTime() > 2 * DAY) {
    return { text: "백업 대기 중", tone: "soon" };
  }
  return null;
}

export default function PipelineBoard() {
  const { data: session } = useSession();
  const me = session?.user?.id;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline");
      if (!res.ok) throw new Error();
      setItems((await res.json()).items ?? []);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, ["task"]);

  // 드래그 이동 — 앞 열로 끌면 그 앞 단계까지 완료, 뒤 열로 끌면 그 단계부터 해제
  const confirm = useConfirm();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ColKey | null>(null);
  async function moveTo(it: Item, target: ColKey) {
    const from = colIndex(it.next ?? "done");
    const to = colIndex(target);
    if (from === to) return;
    if (to > from) {
      if (target === "done") {
        const ok = await confirm({
          title: "보고 완료",
          message: `"${it.title}"을(를) 보고까지 완료할까요? 일정이 완료되고 연동 장비도 반납돼요.`,
          confirmText: "완료",
        });
        if (!ok) return;
      }
      await advance(it, STEP_KEYS[to - 1], true); // 앞 단계는 서버가 함께 체크
    } else {
      await advance(it, STEP_KEYS[to], false); // 그 단계와 뒤 단계 해제
    }
  }

  async function advance(it: Item, step: StepKey, done = true) {
    setBusy(it.id); setErr("");
    try {
      const res = await fetch(`/api/tasks/${it.id}/pipeline`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step, done }),
      });
      const d = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(d.error ?? "처리하지 못했어요."); return; }
      load();
    } finally {
      setBusy(null);
    }
  }

  async function setSelectDue(it: Item, day: string) {
    setBusy(it.id); setErr("");
    try {
      const res = await fetch(`/api/tasks/${it.id}/pipeline`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectDue: day ? new Date(`${day}T23:59:00+09:00`).toISOString() : null }),
      });
      const d = await res.json().catch(() => ({} as any));
      if (!res.ok) { setErr(d.error ?? "처리하지 못했어요."); return; }
      load();
    } finally {
      setBusy(null);
    }
  }

  const shown = useMemo(
    () => (mineOnly ? items.filter((it) => it.assignees.some((a) => a.id === me)) : items),
    [items, mineOnly, me]
  );
  const columns = [
    ...PIPELINE_STEPS.map((s) => ({ key: s.key as StepKey | "done", title: s.key === "shoot" ? "촬영 예정" : `${s.label} 대기` })),
    { key: "done" as const, title: "완료 (최근 14일)" },
  ];
  const lateCount = shown.filter((it) => alertOf(it)?.tone === "late").length;

  return (
    <div className="pl">
      <div className="page-head">
        <div>
          <h1 className="page-title">촬영 진행</h1>
          <p className="page-sub">촬영 → 백업 → 셀렉 → 보정 → 보고. 다음 단계 버튼을 눌러 진행 상황을 함께 맞춰요. 카드를 <b>끌어서 다른 칸으로</b> 옮겨도 돼요. 셀렉을 바로 못 하면 카드의 <b>+ 셀렉 마감</b>에 날짜를 적어두세요.</p>
        </div>
        <button className={`chip chip-btn${mineOnly ? " sel" : ""}`} onClick={() => setMineOnly((v) => !v)}>
          <Icon name="userLine" size={13} /> 내 담당만
        </button>
      </div>
      {lateCount > 0 && <p className="pl-alert">⚠️ 보고 마감이 지난 촬영이 <b>{lateCount}건</b> 있어요.</p>}
      {err && <p className="err-msg">{err}</p>}

      {loading ? (
        <p className="muted-note">불러오는 중…</p>
      ) : loadErr ? (
        <LoadError onRetry={() => { setLoading(true); load(); }} />
      ) : shown.length === 0 ? (
        <div className="card rsv2-empty">
          진행 중인 촬영이 없어요. <b>촬영</b> 카테고리로 일정을 등록하면 자동으로 여기에 올라와요.
        </div>
      ) : (
        <div className="pl-board">
          {columns.map((col) => {
            const list = shown.filter((it) => (col.key === "done" ? !it.next : it.next === col.key));
            return (
              <section
                className={`pl-col${col.key === "done" ? " done" : ""}${dragOver === col.key ? " drop-over" : ""}`} key={col.key}
                onDragOver={dragId ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOver !== col.key) setDragOver(col.key); } : undefined}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((cur) => (cur === col.key ? null : cur)); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const it = items.find((x) => x.id === dragId);
                  setDragId(null); setDragOver(null);
                  if (it) moveTo(it, col.key);
                }}
              >
                <div className="pl-col-head">{col.title} <span className="kb-count">{list.length}</span></div>
                {list.map((it) => {
                  const alert = alertOf(it);
                  return (
                    <div
                      className={`pl-card${alert?.tone === "late" ? " late" : ""}${it.canStep ? " can-drag" : ""}${dragId === it.id ? " dragging" : ""}`} key={it.id}
                      draggable={it.canStep && busy !== it.id}
                      onDragStart={it.canStep ? (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", it.id); setDragId(it.id); } : undefined}
                      onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    >
                      <Link href={`/calendar?task=${it.id}`} className="pl-card-title">
                        {it.category && <span className="dot" style={{ background: it.category.color }} />}
                        {it.title}
                      </Link>
                      <div className="pl-card-meta">
                        {md(it.startDate)}{md(it.startDate) !== md(it.endDate) ? `~${md(it.endDate)}` : ""}
                        {it.assignees.length > 0 && ` · ${it.assignees.map((a) => a.name).join(", ")}`}
                      </div>
                      <div className="pl-steps" aria-label="진행 단계">
                        {PIPELINE_STEPS.map((s) => (
                          <span key={s.key} className={`pl-dot${it.pipeline.steps[s.key] ? " on" : ""}`} title={`${s.label}${it.pipeline.steps[s.key] ? " 완료" : ""}`} />
                        ))}
                      </div>
                      {alert && <span className={`asg-due asg-due-${alert.tone}`}>{alert.text}</span>}
                      {/* 셀렉 마감 — 셀렉 전까지 표시. 바로 못 할 때 담당자가 날짜를 적어둔다 */}
                      {it.next && !it.pipeline.steps.select && (it.canStep || it.pipeline.selectDue) && (
                        it.canStep ? (
                          <DateField
                            variant="bare" className={`pl-seldue${it.pipeline.selectDue ? " set" : ""}`}
                            value={kstDay(it.pipeline.selectDue)} disabled={busy === it.id} clearable aria-label="셀렉 마감일"
                            onChange={(v) => setSelectDue(it, v)}
                          >
                            {it.pipeline.selectDue ? `셀렉 마감 ${md(it.pipeline.selectDue)}` : "+ 셀렉 마감"}
                          </DateField>
                        ) : (
                          <span className="pl-seldue set">셀렉 마감 {md(it.pipeline.selectDue!)}</span>
                        )
                      )}
                      {it.canStep && (
                        <div className="pl-card-actions">
                          {it.next ? (
                            <button className="btn btn-primary btn-sm" disabled={busy === it.id} onClick={() => advance(it, it.next!)}>
                              {STEP_LABEL[it.next]} 완료
                            </button>
                          ) : (
                            <button className="btn btn-ghost btn-sm" disabled={busy === it.id} onClick={() => advance(it, "report", false)}>
                              보고 취소
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
