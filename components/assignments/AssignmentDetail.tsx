"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { LoadError } from "@/components/LoadError";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAutoRefresh } from "@/components/useAutoRefresh";
import { photoUrl } from "@/lib/imageResize";
import PhotoUploader, { type Photo } from "./PhotoUploader";
import { AssignmentFormModal, dueLabel } from "./AssignmentBoard";

type Person = { id: string; name: string };
type Assignment = {
  id: string; title: string; concept: string; references: Photo[];
  team: { id: string; name: string; color: string } | null; createdBy: Person | null;
  dueDate: string | null; closed: boolean; createdAt: string;
};
type Sub = {
  id: string; user: Person | null; photos: Photo[]; note: string;
  feedback: string; feedbackBy: string | null; feedbackAt: string | null; updatedAt: string;
};
type Data = { assignment: Assignment; submissions: Sub[]; pending: Person[]; canManage: boolean; canSubmit: boolean };

function relTime(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export default function AssignmentDetail({ id, meId }: { id: string; meId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [view, setView] = useState<"people" | "wall">("people");
  const [editOpen, setEditOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [lightbox, setLightbox] = useState<{ photos: (Photo & { who?: string })[]; index: number } | null>(null);
  const [actionErr, setActionErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/assignments/${id}`);
      if (res.status === 404 || res.status === 403) { router.replace("/assignments"); return; }
      if (!res.ok) throw new Error();
      setData(await res.json());
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, ["assignment"]); // 점검 중 새 제출이 바로 보이도록

  if (loadErr && !data) return <LoadError onRetry={load} />;
  if (!data) return <p className="muted-note">불러오는 중…</p>;

  const { assignment: a, submissions, pending, canManage, canSubmit } = data;
  const mine = submissions.find((s) => s.user?.id === meId) ?? null;
  const due = !a.closed ? dueLabel(a.dueDate) : null;
  const allPhotos = submissions.flatMap((s) => s.photos.map((p) => ({ ...p, who: s.user?.name ?? "?" })));

  async function patch(body: object) {
    setActionErr("");
    const res = await fetch(`/api/assignments/${a.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({} as any));
    if (!res.ok) { setActionErr(d.error ?? "처리 실패"); return; }
    load();
  }

  async function remove() {
    const ok = await confirm({
      title: "과제 삭제",
      message: "과제와 모든 제출물·사진이 삭제됩니다. 되돌릴 수 없어요.",
      confirmText: "삭제", danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/assignments/${a.id}`, { method: "DELETE" });
    if (res.ok) router.push("/assignments");
    else setActionErr((await res.json().catch(() => ({}))).error ?? "삭제 실패");
  }

  return (
    <div className="asg-detail">
      <Link href="/assignments" className="ev-back"><Icon name="chevronL" size={14} /> 과제 목록</Link>

      {/* 헤더 */}
      <div className="asg-head">
        <div className="asg-head-main">
          <div className="asg-card-meta">
            {a.team && <span className="chip"><span className="dot" style={{ background: a.team.color }} />{a.team.name}</span>}
            {a.closed ? <span className="asg-due asg-due-closed">마감됨</span> : due && <span className={`asg-due asg-due-${due.tone}`}>{due.text}</span>}
            <span className="asg-head-by">{a.createdBy?.name} · {relTime(a.createdAt)}</span>
          </div>
          <h1 className="page-title" style={{ margin: "6px 0 0" }}>{a.title}</h1>
        </div>
        <div className="asg-head-actions">
          {submissions.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setReview(true)}>
              <Icon name="camera" size={15} /> 점검 모드
            </button>
          )}
          {canManage && (
            <>
              <button className="btn btn-line btn-sm" onClick={() => setEditOpen(true)}>수정</button>
              <button className="btn btn-line btn-sm" onClick={() => patch({ closed: !a.closed })}>{a.closed ? "다시 열기" : "마감하기"}</button>
              <button className="btn btn-danger btn-sm" onClick={remove}>삭제</button>
            </>
          )}
        </div>
      </div>
      {actionErr && <p className="err-msg">{actionErr}</p>}

      {/* 컨셉 + 레퍼런스 */}
      <section className="card asg-brief">
        <div className="detail-section-label" style={{ marginTop: 0 }}>컨셉 · 촬영 가이드</div>
        {a.concept ? <div className="asg-concept">{a.concept}</div> : <p className="muted-note" style={{ padding: 0 }}>설명이 없어요.</p>}
        {a.references.length > 0 && (
          <>
            <div className="detail-section-label">레퍼런스 {a.references.length}장</div>
            <div className="asg-ref-grid">
              {a.references.map((p, i) => (
                <button key={p.pathname} className="asg-ref" onClick={() => setLightbox({ photos: a.references, index: i })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(p.pathname)} alt={p.caption || `레퍼런스 ${i + 1}`} loading="lazy" />
                  {p.caption && <span className="asg-ref-cap">{p.caption}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 내 제출 */}
      {canSubmit && (
        <MySubmission assignmentId={a.id} mine={mine} closed={a.closed} onSaved={load} />
      )}

      {/* 제출 현황 */}
      <div className="asg-subs-head">
        <h2>제출 <b>{submissions.length}</b>{pending.length > 0 && <span> · 미제출 {pending.length}</span>}</h2>
        {submissions.length > 0 && (
          <div className="seg" role="tablist" aria-label="보기 방식">
            <button className={view === "people" ? "on" : ""} onClick={() => setView("people")}>사람별</button>
            <button className={view === "wall" ? "on" : ""} onClick={() => setView("wall")}>사진 모아보기</button>
          </div>
        )}
      </div>
      {pending.length > 0 && (
        <p className="asg-pending">
          아직 안 냈어요: {pending.map((p) => p.name).join(", ")}
        </p>
      )}

      {submissions.length === 0 ? (
        <div className="card rsv2-empty">아직 제출한 사람이 없어요.</div>
      ) : view === "people" ? (
        <div className="asg-subs">
          {submissions.map((s) => (
            <SubmissionCard
              key={s.id} s={s} assignmentId={a.id} canManage={canManage}
              onOpen={(i) => setLightbox({ photos: s.photos.map((p) => ({ ...p, who: s.user?.name })), index: i })}
              onChanged={load}
            />
          ))}
        </div>
      ) : (
        <div className="asg-wall">
          {allPhotos.map((p, i) => (
            <button key={p.pathname} className="asg-wall-item" onClick={() => setLightbox({ photos: allPhotos, index: i })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p.pathname)} alt={p.caption || p.who} loading="lazy" />
              <span className="asg-wall-who">{p.who}</span>
            </button>
          ))}
        </div>
      )}

      {editOpen && a.team && (
        <AssignmentFormModal
          teams={[a.team]}
          initial={{ id: a.id, title: a.title, concept: a.concept, references: a.references, dueDate: a.dueDate, teamId: a.team.id }}
          onClose={() => setEditOpen(false)}
          onSaved={load}
        />
      )}
      {lightbox && <Lightbox photos={lightbox.photos} start={lightbox.index} onClose={() => setLightbox(null)} />}
      {review && (
        <ReviewMode
          assignment={a} submissions={submissions} canManage={canManage}
          onClose={() => setReview(false)} onChanged={load}
        />
      )}
    </div>
  );
}

/* ── 내 제출 (작성·수정·취소) ── */
function MySubmission({ assignmentId, mine, closed, onSaved }: {
  assignmentId: string; mine: Sub | null; closed: boolean; onSaved: () => void;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(!mine);
  const [photos, setPhotos] = useState<Photo[]>(mine?.photos ?? []);
  const [note, setNote] = useState(mine?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // 다른 기기에서 저장했거나 피드백이 갱신되면 보기 모드 내용 동기화
  useEffect(() => {
    if (!editing) { setPhotos(mine?.photos ?? []); setNote(mine?.note ?? ""); }
  }, [mine, editing]);

  async function save() {
    setErr("");
    if (photos.length === 0) { setErr("사진을 1장 이상 올려주세요."); return; }
    setBusy(true);
    const res = await fetch(`/api/assignments/${assignmentId}/submission`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photos, note }),
    });
    const d = await res.json().catch(() => ({} as any));
    setBusy(false);
    if (!res.ok) { setErr(d.error ?? "제출에 실패했어요."); return; }
    setEditing(false);
    onSaved();
  }

  async function cancelSubmission() {
    const ok = await confirm({ title: "제출 취소", message: "제출한 사진과 설명이 모두 삭제돼요.", confirmText: "제출 취소", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/assignments/${assignmentId}/submission`, { method: "DELETE" });
    if (res.ok) { setPhotos([]); setNote(""); setEditing(true); onSaved(); }
  }

  if (closed && !mine) {
    return <div className="card asg-mine"><p className="muted-note" style={{ padding: 0 }}>마감된 과제예요. 제출하지 않았어요.</p></div>;
  }

  return (
    <section className={`card asg-mine${mine && !editing ? " done" : ""}`}>
      <div className="asg-mine-head">
        <h2>{mine ? (editing ? "내 제출 수정" : "✅ 제출 완료") : "내 과제 제출"}</h2>
        {mine && !editing && !closed && (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-line btn-sm" onClick={() => setEditing(true)}>수정</button>
            <button className="btn btn-ghost btn-sm" onClick={cancelSubmission}>제출 취소</button>
          </div>
        )}
      </div>

      {editing ? (
        <>
          <PhotoUploader value={photos} onChange={setPhotos} captionPlaceholder="이 컷의 의도·설정 (선택)" />
          <div className="field" style={{ marginTop: 12 }}>
            <label>촬영 노트</label>
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3}
              placeholder="어떻게 찍었는지, 어려웠던 점, 레퍼런스와 다르게 시도한 점 등"
            />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions" style={{ marginTop: 10 }}>
            {mine && <button type="button" className="btn btn-ghost" onClick={() => { setEditing(false); setErr(""); }}>취소</button>}
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "저장 중…" : mine ? "수정 저장" : "제출하기"}</button>
          </div>
        </>
      ) : mine && (
        <>
          <p className="asg-mine-sum">사진 {mine.photos.length}장 · {relTime(mine.updatedAt)} 저장</p>
          {mine.feedback && (
            <div className="asg-feedback"><b>💬 {mine.feedbackBy ?? "팀장"}</b> {mine.feedback}</div>
          )}
        </>
      )}
    </section>
  );
}

/* ── 제출물 카드 (사람별 보기) ── */
function SubmissionCard({ s, assignmentId, canManage, onOpen, onChanged }: {
  s: Sub; assignmentId: string; canManage: boolean; onOpen: (i: number) => void; onChanged: () => void;
}) {
  return (
    <div className="card asg-sub">
      <div className="asg-sub-head">
        <span className="avatar" aria-hidden>{s.user?.name?.slice(0, 1) ?? "?"}</span>
        <b>{s.user?.name ?? "?"}</b>
        <span className="asg-sub-meta">사진 {s.photos.length}장 · {relTime(s.updatedAt)}</span>
      </div>
      {s.note && <p className="asg-sub-note">{s.note}</p>}
      <div className="asg-sub-grid">
        {s.photos.map((p, i) => (
          <button key={p.pathname} className="asg-sub-photo" onClick={() => onOpen(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(p.pathname)} alt={p.caption || `사진 ${i + 1}`} loading="lazy" />
            {p.caption && <span className="asg-ref-cap">{p.caption}</span>}
          </button>
        ))}
      </div>
      <FeedbackBox s={s} assignmentId={assignmentId} canManage={canManage} onChanged={onChanged} />
    </div>
  );
}

function FeedbackBox({ s, assignmentId, canManage, onChanged, dark }: {
  s: Sub; assignmentId: string; canManage: boolean; onChanged: () => void; dark?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.feedback);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!editing) setText(s.feedback); }, [s.feedback, editing]);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/assignments/${assignmentId}/feedback`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: s.user?.id, feedback: text }),
    });
    setBusy(false);
    if (res.ok) { setEditing(false); onChanged(); }
  }

  if (editing) {
    return (
      <div className={`asg-fb-edit${dark ? " dark" : ""}`}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="잘된 점, 다음에 시도해볼 점" autoFocus />
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>취소</button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? "저장 중…" : "피드백 저장"}</button>
        </div>
      </div>
    );
  }
  if (s.feedback) {
    return (
      <div className={`asg-feedback${dark ? " dark" : ""}`}>
        <b>💬 {s.feedbackBy ?? "팀장"}</b> {s.feedback}
        {canManage && <button className="asg-fb-btn" onClick={() => setEditing(true)}>수정</button>}
      </div>
    );
  }
  return canManage ? (
    <button className={`asg-fb-add${dark ? " dark" : ""}`} onClick={() => setEditing(true)}>💬 피드백 남기기</button>
  ) : null;
}

/* ── 라이트박스 (사진 크게 보기, ←→ 이동) ── */
function Lightbox({ photos, start, onClose }: { photos: (Photo & { who?: string })[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const go = useCallback((d: number) => setI((x) => (x + d + photos.length) % photos.length), [photos.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);
  const p = photos[i];
  if (!p) return null;

  return createPortal(
    <div className="lb" onClick={onClose}>
      <button className="lb-close" aria-label="닫기" onClick={onClose}>✕</button>
      {photos.length > 1 && <button className="lb-nav lb-prev" aria-label="이전" onClick={(e) => { e.stopPropagation(); go(-1); }}><Icon name="chevronL" size={26} /></button>}
      <figure className="lb-fig" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl(p.pathname)} alt={p.caption || ""} />
        <figcaption>
          {p.who && <b>{p.who}</b>} {p.caption}
          <span className="lb-count">{i + 1} / {photos.length}</span>
        </figcaption>
      </figure>
      {photos.length > 1 && <button className="lb-nav lb-next" aria-label="다음" onClick={(e) => { e.stopPropagation(); go(1); }}><Icon name="chevronR" size={26} /></button>}
    </div>,
    document.body
  );
}

/* ── 점검 모드 — 모일 때 화면 공유용 전체화면 슬라이드
   순서: 레퍼런스 → 제출자별 사진. ←→ 사진 이동(사람 경계 넘어감), 하단에서 사람 바로가기, R로 레퍼런스 비교 */
function ReviewMode({ assignment: a, submissions, canManage, onClose, onChanged }: {
  assignment: Assignment; submissions: Sub[]; canManage: boolean; onClose: () => void; onChanged: () => void;
}) {
  // 슬라이드 평탄화: 레퍼런스(있으면) + 제출자별 사진
  const slides = useMemo(() => {
    const out: { kind: "ref" | "sub"; subIdx: number; photo: Photo; photoIdx: number }[] = [];
    a.references.forEach((p, i) => out.push({ kind: "ref", subIdx: -1, photo: p, photoIdx: i }));
    submissions.forEach((s, si) => s.photos.forEach((p, pi) => out.push({ kind: "sub", subIdx: si, photo: p, photoIdx: pi })));
    return out;
  }, [a.references, submissions]);
  const [i, setI] = useState(0);
  const [showRef, setShowRef] = useState(false);
  const cur = slides[Math.min(i, slides.length - 1)];
  const sub = cur?.kind === "sub" ? submissions[cur.subIdx] : null;

  const go = useCallback((d: number) => setI((x) => Math.max(0, Math.min(slides.length - 1, x + d))), [slides.length]);
  const jumpTo = (subIdx: number) => {
    const k = slides.findIndex((s) => (subIdx < 0 ? s.kind === "ref" : s.kind === "sub" && s.subIdx === subIdx));
    if (k >= 0) setI(k);
  };

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key.toLowerCase() === "r") setShowRef((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [go, onClose]);

  if (!cur) return null;
  const sectionTotal = cur.kind === "ref" ? a.references.length : sub?.photos.length ?? 0;

  return createPortal(
    <div className="rv">
      <div className="rv-top">
        <span className="rv-title">{a.title}</span>
        <span className="rv-who">
          {cur.kind === "ref" ? "📌 레퍼런스" : <>📸 <b>{sub?.user?.name}</b></>}
          <span className="rv-count">{cur.photoIdx + 1} / {sectionTotal}</span>
        </span>
        <div className="rv-top-actions">
          {a.references.length > 0 && cur.kind === "sub" && (
            <button className={`rv-btn${showRef ? " on" : ""}`} onClick={() => setShowRef((v) => !v)}>레퍼런스 비교 (R)</button>
          )}
          <button className="rv-btn" onClick={onClose}>닫기 (Esc)</button>
        </div>
      </div>

      <div className="rv-body">
        <div className="rv-stage">
          {showRef && cur.kind === "sub" && (
            <div className="rv-refs">
              {a.references.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.pathname} src={photoUrl(p.pathname)} alt="레퍼런스" />
              ))}
            </div>
          )}
          <button className="rv-nav rv-prev" aria-label="이전" disabled={i === 0} onClick={() => go(-1)}><Icon name="chevronL" size={30} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="rv-img" src={photoUrl(cur.photo.pathname)} alt={cur.photo.caption || ""} />
          <button className="rv-nav rv-next" aria-label="다음" disabled={i === slides.length - 1} onClick={() => go(1)}><Icon name="chevronR" size={30} /></button>
        </div>

        <aside className="rv-side">
          {cur.kind === "ref" ? (
            <>
              <div className="rv-label">컨셉</div>
              <p className="rv-text">{a.concept || "설명 없음"}</p>
            </>
          ) : sub && (
            <>
              {sub.note && (<><div className="rv-label">촬영 노트</div><p className="rv-text">{sub.note}</p></>)}
              <div className="rv-label">피드백</div>
              <FeedbackBox s={sub} assignmentId={a.id} canManage={canManage} onChanged={onChanged} dark />
            </>
          )}
          {cur.photo.caption && (<><div className="rv-label">이 사진</div><p className="rv-text">{cur.photo.caption}</p></>)}
        </aside>
      </div>

      {/* 사람 바로가기 */}
      <div className="rv-people">
        {a.references.length > 0 && (
          <button className={`rv-chip${cur.kind === "ref" ? " on" : ""}`} onClick={() => jumpTo(-1)}>📌 레퍼런스</button>
        )}
        {submissions.map((s, si) => (
          <button key={s.id} className={`rv-chip${cur.kind === "sub" && cur.subIdx === si ? " on" : ""}`} onClick={() => jumpTo(si)}>
            {s.user?.name ?? "?"} <span>{s.photos.length}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
