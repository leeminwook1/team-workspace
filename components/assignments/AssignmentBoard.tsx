"use client";
import { ModalClose } from "@/components/ModalClose";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { LoadError } from "@/components/LoadError";
import { useAutoRefresh } from "@/components/useAutoRefresh";
import { photoUrl } from "@/lib/imageResize";
import PhotoUploader, { type Photo } from "./PhotoUploader";

type TeamOpt = { id: string; name: string; color: string };
type Item = {
  id: string; title: string; concept: string; cover: string | null; refCount: number;
  team: TeamOpt | null; createdBy: string; dueDate: string | null; closed: boolean; createdAt: string;
  submitted: number; expected: number; mySubmitted: boolean;
};

export function dueLabel(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const days = Math.ceil((new Date(d.toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / 86400_000);
  const md = d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
  if (days < 0) return { text: `${md} 마감 지남`, tone: "late" as const };
  if (days === 0) return { text: "오늘 마감", tone: "soon" as const };
  if (days <= 2) return { text: `D-${days} · ${md}`, tone: "soon" as const };
  return { text: `D-${days} · ${md}`, tone: "normal" as const };
}

export default function AssignmentBoard({ manageTeams }: { manageTeams: TeamOpt[] }) {
  const [tab, setTab] = useState<"open" | "closed" | "best">("open");
  const [best, setBest] = useState<{ pathname: string; caption: string; who: string; assignmentId: string; assignmentTitle: string }[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      if (tab === "best") {
        const res = await fetch("/api/assignments/best");
        if (!res.ok) throw new Error();
        setBest((await res.json()).photos ?? []);
      } else {
        const res = await fetch(`/api/assignments?status=${tab}`);
        if (!res.ok) throw new Error();
        setItems((await res.json()).assignments ?? []);
      }
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useAutoRefresh(load, ["assignment"]);

  return (
    <div className="asg">
      <div className="page-head">
        <div>
          <h1 className="page-title">과제</h1>
          <p className="page-sub">레퍼런스와 컨셉에 맞춰 촬영하고, 모일 때 한 화면에서 함께 점검해요.</p>
        </div>
        {manageTeams.length > 0 && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={16} strokeWidth={2.4} /> 과제 내기
          </button>
        )}
      </div>

      <div className="seg" role="tablist" aria-label="과제 상태" style={{ marginBottom: 14 }}>
        <button className={tab === "open" ? "on" : ""} onClick={() => setTab("open")}>진행 중</button>
        <button className={tab === "closed" ? "on" : ""} onClick={() => setTab("closed")}>마감</button>
        <button className={tab === "best" ? "on" : ""} onClick={() => setTab("best")}>★ 베스트 컷</button>
      </div>

      {loading ? (
        <p className="muted-note">불러오는 중…</p>
      ) : loadErr ? (
        <LoadError onRetry={() => { setLoading(true); load(); }} />
      ) : tab === "best" ? (
        best.length === 0 ? (
          <p className="muted-note">아직 베스트 컷이 없어요. 과제 점검 때 과장이 ★를 누르면 여기에 모여요.</p>
        ) : (
          <div className="asg-wall">
            {best.map((p) => (
              <Link key={p.pathname} href={`/assignments/${p.assignmentId}`} className="asg-wall-item" title={p.caption}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(p.pathname)} alt={p.caption || p.who} loading="lazy" />
                <span className="asg-wall-who">{p.who} · {p.assignmentTitle}</span>
              </Link>
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <p className="muted-note">{tab === "open" ? "진행 중인 과제가 없어요." : "마감된 과제가 없어요."}</p>
      ) : (
        <div className="asg-grid">
          {items.map((a) => {
            const due = !a.closed ? dueLabel(a.dueDate) : null;
            const pct = a.expected > 0 ? Math.round((a.submitted / a.expected) * 100) : 0;
            return (
              <Link key={a.id} href={`/assignments/${a.id}`} className="asg-card">
                <div className="asg-cover">
                  {a.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl(a.cover)} alt="" loading="lazy" />
                  ) : (
                    <span className="asg-cover-empty"><Icon name="camera" size={28} /></span>
                  )}
                  {a.refCount > 1 && <span className="asg-cover-count">+{a.refCount - 1}</span>}
                  {a.mySubmitted && <span className="asg-badge-done"><Icon name="check" size={12} strokeWidth={3} /> 제출함</span>}
                </div>
                <div className="asg-card-body">
                  <div className="asg-card-meta">
                    {a.team && <span className="chip"><span className="dot" style={{ background: a.team.color }} />{a.team.name}</span>}
                    {due && <span className={`asg-due asg-due-${due.tone}`}>{due.text}</span>}
                  </div>
                  <div className="asg-card-title">{a.title}</div>
                  {a.concept && <div className="asg-card-concept">{a.concept}</div>}
                  <div className="asg-card-foot">
                    <span>제출 <b>{a.submitted}</b>{a.expected > 0 ? ` / ${a.expected}` : ""}</span>
                    <span className="asg-card-by">{a.createdBy}</span>
                  </div>
                  {a.expected > 0 && <div className="pg-track"><div style={{ width: `${Math.min(100, pct)}%`, background: "var(--primary)" }} /></div>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {createOpen && <AssignmentFormModal teams={manageTeams} onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

/* ── 과제 내기 / 수정 모달 ── */
export function AssignmentFormModal({
  teams, onClose, initial, onSaved,
}: {
  teams: TeamOpt[];
  onClose: () => void;
  initial?: { id: string; title: string; concept: string; references: Photo[]; dueDate: string | null; teamId: string };
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [concept, setConcept] = useState(initial?.concept ?? "");
  const [refs, setRefs] = useState<Photo[]>(initial?.references ?? []);
  const [teamId, setTeamId] = useState(initial?.teamId ?? teams[0]?.id ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ? initial.dueDate.slice(0, 10) : "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const payload = {
      title, concept, references: refs, teamId,
      // 마감일은 그날 23:59(KST)까지
      dueDate: dueDate ? new Date(`${dueDate}T23:59:00+09:00`).toISOString() : null,
    };
    const res = await fetch(isEdit ? `/api/assignments/${initial!.id}` : "/api/assignments", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({} as any));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "저장에 실패했어요."); return; }
    if (isEdit) { onSaved?.(); onClose(); }
    else router.push(`/assignments/${data.id}`);
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>{isEdit ? "과제 수정" : "과제 내기"}</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label>과제 제목</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 역광 인물 — 윤곽광 살리기" maxLength={120} required />
          </div>
          <div className="form-grid-2">
            {!isEdit && teams.length > 1 ? (
              <div className="field">
                <label>팀</label>
                <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            ) : <div />}
            <div className="field">
              <label>제출 마감 (선택)</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>컨셉 · 촬영 가이드</label>
            <textarea
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              maxLength={3000}
              rows={5}
              placeholder={"어떤 느낌을, 어떻게 찍어오면 되는지 적어주세요.\n예) 해 질 녘 역광, 인물 윤곽에 빛이 맺히게. 노출은 얼굴 기준 -0.7, 배경은 날려도 OK."}
            />
          </div>
          <div className="field">
            <label>레퍼런스 사진</label>
            <PhotoUploader value={refs} onChange={setRefs} captionPlaceholder="이 레퍼런스에서 볼 포인트 (선택)" />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? "저장 중…" : isEdit ? "저장" : "과제 내기"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
