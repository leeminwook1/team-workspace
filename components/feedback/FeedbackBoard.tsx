"use client";
import { ModalClose } from "@/components/ModalClose";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/icons";
import { useConfirm } from "@/components/ConfirmProvider";
import { LoadError } from "@/components/LoadError";
import { useAutoRefresh } from "@/components/useAutoRefresh";

type Person = { id: string; name: string } | null;
type FbComment = { id: string; user: Person; body: string; createdAt: string };
type Feedback = {
  id: string;
  type: "feature" | "bug" | "improve";
  title: string;
  body: string;
  status: "open" | "in_progress" | "done" | "declined";
  createdBy: Person;
  votes: number;
  myVote: boolean;
  comments: FbComment[];
  createdAt: string;
};

const TYPE: Record<Feedback["type"], { label: string; emoji: string; color: string }> = {
  feature: { label: "기능 제안", emoji: "💡", color: "#3182f6" },
  bug: { label: "버그", emoji: "🐞", color: "var(--danger)" },
  improve: { label: "개선", emoji: "🔧", color: "#e8951b" },
};
const STATUS: Record<Feedback["status"], [string, string]> = {
  open: ["접수", "var(--st-todo)"],
  in_progress: ["진행중", "var(--st-prog)"],
  done: ["반영 완료", "var(--st-done)"],
  declined: ["반려", "var(--ink-faint)"],
};

function relTime(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export default function FeedbackBoard({ canManage }: { canManage: boolean }) {
  const { data: session } = useSession();
  const user = session?.user;
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Feedback | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/feedback");
      if (!res.ok) throw new Error(String(res.status));
      setItems((await res.json()).feedback ?? []);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, ["feedback"]);

  const canEdit = (f: Feedback) => user?.role === "admin" || f.createdBy?.id === user?.id;

  const shown = items.filter((f) =>
    (typeFilter === "all" || f.type === typeFilter) &&
    (statusFilter === "all" || f.status === statusFilter)
  );

  return (
    <div className="feedback">
      <div className="page-head">
        <div>
          <h1 className="page-title">피드백</h1>
          <p className="page-sub">쓰다가 느낀 점을 편하게 남겨주세요 — 기능 제안·버그·개선 무엇이든 좋아요.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={16} strokeWidth={2.4} /> 피드백 남기기
        </button>
      </div>

      {loading ? (
        <p className="muted-note">불러오는 중…</p>
      ) : loadErr ? (
        <LoadError onRetry={() => { setLoading(true); load(); }} />
      ) : items.length === 0 ? (
        <p className="muted-note">첫 피드백을 남겨보세요. 🙌</p>
      ) : (
        <>
          <div className="dir-filters">
            <button className={`chip chip-btn${typeFilter === "all" ? " sel" : ""}`} onClick={() => setTypeFilter("all")}>
              전체 <b className="dir-chip-n">{items.length}</b>
            </button>
            {Object.entries(TYPE).map(([key, t]) => {
              const n = items.filter((f) => f.type === key).length;
              if (n === 0) return null;
              return (
                <button key={key} className={`chip chip-btn${typeFilter === key ? " sel" : ""}`} onClick={() => setTypeFilter(key)}>
                  {t.emoji} {t.label} <b className="dir-chip-n">{n}</b>
                </button>
              );
            })}
            <select className="dir-team-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="상태 필터">
              <option value="all">전체 상태</option>
              {Object.entries(STATUS).map(([key, [label]]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {shown.length === 0 ? (
            <p className="muted-note">조건에 맞는 피드백이 없습니다.</p>
          ) : (
            <div className="dir-list">
              {shown.map((f) => (
                <FeedbackCard key={f.id} fb={f} canManage={canManage} canEdit={canEdit(f)}
                  myId={user?.id} onEdit={() => setEditTarget(f)} onChanged={load} />
              ))}
            </div>
          )}
        </>
      )}

      {createOpen && (
        <FeedbackModal onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />
      )}
      {editTarget && (
        <FeedbackModal fb={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />
      )}
    </div>
  );
}

function FeedbackCard({ fb, canManage, canEdit, myId, onEdit, onChanged }: {
  fb: Feedback; canManage: boolean; canEdit: boolean; myId?: string; onEdit: () => void; onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comment, setComment] = useState("");
  const t = TYPE[fb.type];
  const [stLabel, stColor] = STATUS[fb.status];

  async function patch(body: object) {
    setBusy(true);
    const res = await fetch(`/api/feedback/${fb.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      await confirm({ title: "알림", message: data.error ?? "처리하지 못했어요. 잠시 후 다시 시도해주세요.", confirmText: "확인", alert: true });
    }
    onChanged();
  }
  async function remove() {
    const ok = await confirm({ title: "피드백 삭제", message: "이 피드백을 삭제할까요?", confirmText: "삭제", danger: true });
    if (!ok) return;
    setBusy(true);
    await fetch(`/api/feedback/${fb.id}`, { method: "DELETE" });
    onChanged();
  }
  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    const body = comment.trim();
    if (!body) return;
    setBusy(true);
    const res = await fetch(`/api/feedback/${fb.id}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setBusy(false);
    if (res.ok) setComment("");
    onChanged();
  }
  async function removeComment(commentId: string) {
    const ok = await confirm({ title: "댓글 삭제", message: "이 댓글을 삭제할까요?", confirmText: "삭제", danger: true });
    if (!ok) return;
    await fetch(`/api/feedback/${fb.id}/comments`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId }),
    });
    onChanged();
  }

  return (
    <div className={`dir-card${fb.status === "declined" ? " fb-declined" : ""}`}>
      <div className="dir-top">
        <span className="badge" style={{ background: `color-mix(in srgb, ${t.color} 12%, transparent)`, color: t.color }}>
          {t.emoji} {t.label}
        </span>
        <span className="badge" style={{ background: `color-mix(in srgb, ${stColor} 14%, transparent)`, color: stColor }}>
          <span className="badge-dot" style={{ background: stColor }} />{stLabel}
        </span>
        <span className="dir-meta-r">{fb.createdBy?.name ?? "?"} · {relTime(fb.createdAt)}</span>
      </div>

      <h3 className="dir-title">{fb.title}</h3>
      {fb.body && <p className="dir-body">{fb.body}</p>}

      <div className="fb-foot">
        <button className={`fb-vote${fb.myVote ? " on" : ""}`} disabled={busy} onClick={() => patch({ vote: !fb.myVote })}>
          👍 공감 {fb.votes > 0 && <b>{fb.votes}</b>}
        </button>
        <button className="fb-comments-btn" onClick={() => setCommentsOpen(!commentsOpen)}>
          💬 댓글 {fb.comments.length > 0 && <b>{fb.comments.length}</b>}
        </button>
        <span style={{ flex: 1 }} />
        {canManage && (
          <div className="seg dir-seg">
            {Object.entries(STATUS).map(([key, [label]]) => (
              <button key={key} className={fb.status === key ? "on" : ""} disabled={busy} onClick={() => patch({ status: key })}>{label}</button>
            ))}
          </div>
        )}
        {canEdit && (
          <>
            <button className="btn btn-line btn-xs" disabled={busy} onClick={onEdit}>수정</button>
            <button className="btn btn-danger btn-xs" disabled={busy} onClick={remove}>삭제</button>
          </>
        )}
      </div>

      {commentsOpen && (
        <div className="fb-comments">
          {fb.comments.map((c) => (
            <div className="fb-comment" key={c.id}>
              <span className="avatar sm" aria-hidden>{c.user?.name?.slice(0, 1) ?? "?"}</span>
              <div className="fb-comment-body">
                <div className="fb-comment-head">
                  <b>{c.user?.name ?? "알 수 없음"}</b>
                  <span>{relTime(c.createdAt)}</span>
                  {(c.user?.id === myId || canManage) && (
                    <button className="fb-comment-del" onClick={() => removeComment(c.id)}>삭제</button>
                  )}
                </div>
                <p>{c.body}</p>
              </div>
            </div>
          ))}
          <form className="fb-comment-form" onSubmit={addComment}>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="댓글 남기기" maxLength={1000} />
            <button className="btn btn-line btn-sm" disabled={busy || !comment.trim()}>등록</button>
          </form>
        </div>
      )}
    </div>
  );
}

function FeedbackModal({ fb, onClose, onSaved }: { fb?: Feedback; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<Feedback["type"]>(fb?.type ?? "feature");
  const [title, setTitle] = useState(fb?.title ?? "");
  const [body, setBody] = useState(fb?.body ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await fetch(fb ? `/api/feedback/${fb.id}` : "/api/feedback", {
      method: fb ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, title, body }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
    onSaved();
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <ModalClose onClose={onClose} />
        <h2>{fb ? "피드백 수정" : "피드백 남기기"}</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label>종류</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(TYPE).map(([key, t]) => (
                <button type="button" key={key}
                  className={`chip chip-btn${type === key ? " sel" : ""}`}
                  onClick={() => setType(key as Feedback["type"])}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>제목</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "bug" ? "예: 달력에서 일정 드래그가 안 돼요" : "예: 일정에 파일 첨부가 됐으면 해요"} required />
          </div>
          <div className="field">
            <label>내용 (선택)</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6}
              placeholder={type === "bug" ? "어떤 화면에서, 어떻게 했을 때, 어떤 문제가 생겼는지 적어주시면 빨리 고칠 수 있어요." : "자세한 내용을 적어주세요."} />
          </div>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? "저장 중…" : fb ? "수정 저장" : "등록"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
