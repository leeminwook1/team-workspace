"use client";
import { ModalClose } from "@/components/ModalClose";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/icons";
import { useConfirm } from "@/components/ConfirmProvider";
import { LoadError } from "@/components/LoadError";
import { useAutoRefresh } from "@/components/useAutoRefresh";

type Person = { id: string; name: string } | null;
type Notice = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdBy: Person;
  createdAt: string;
  updatedAt: string;
  isNew: boolean;
  readCount: number;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export default function NoticeBoard({ canCreate }: { canCreate: boolean }) {
  const { data: session } = useSession();
  const user = session?.user;
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(false);
  const [editTarget, setEditTarget] = useState<Notice | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notices");
      if (!res.ok) throw new Error(String(res.status));
      setItems((await res.json()).notices ?? []);
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, ["notice"]);

  const canEdit = (n: Notice) => user?.role === "admin" || n.createdBy?.id === user?.id;

  return (
    <div className="notices">
      <div className="page-head">
        <div>
          <h1 className="page-title">공지사항</h1>
          <p className="page-sub">문화과 전체에 알리는 소식이에요. 새 공지가 올라오면 알림이 가요.</p>
        </div>
        {canCreate && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={16} strokeWidth={2.4} /> 공지 올리기
          </button>
        )}
      </div>

      {loading ? (
        <p className="muted-note">불러오는 중…</p>
      ) : loadErr ? (
        <LoadError onRetry={() => { setLoading(true); load(); }} />
      ) : items.length === 0 ? (
        <p className="muted-note">아직 공지가 없습니다.</p>
      ) : (
        <div className="dir-list">
          {items.map((n) => (
            <NoticeCard key={n.id} notice={n} canEdit={canEdit(n)} onEdit={() => setEditTarget(n)} onChanged={load} />
          ))}
        </div>
      )}

      {createOpen && (
        <NoticeModal onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); load(); }} />
      )}
      {editTarget && (
        <NoticeModal notice={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />
      )}
    </div>
  );
}

function NoticeCard({ notice: n, canEdit, onEdit, onChanged }: {
  notice: Notice; canEdit: boolean; onEdit: () => void; onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  // 긴 공지는 접어두고 펼쳐 보기
  const long = n.body.length > 280 || n.body.split("\n").length > 6;
  const [open, setOpen] = useState(false);

  async function togglePin() {
    setBusy(true);
    await fetch(`/api/notices/${n.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !n.pinned }),
    });
    setBusy(false);
    onChanged();
  }
  async function remove() {
    const ok = await confirm({ title: "공지 삭제", message: "이 공지를 삭제할까요?", confirmText: "삭제", danger: true });
    if (!ok) return;
    setBusy(true);
    await fetch(`/api/notices/${n.id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className={`dir-card notice-card${n.pinned ? " pinned" : ""}`}>
      <div className="dir-top">
        {n.pinned && <span className="badge notice-pin">📌 고정</span>}
        {n.isNew && <span className="badge notice-new">NEW</span>}
        <span className="dir-meta-r">{n.createdBy?.name ?? "?"} · {fmtDate(n.createdAt)}</span>
      </div>
      <h3 className="dir-title">{n.title}</h3>
      {n.body && (
        <>
          <p className={`dir-body${long && !open ? " notice-clamp" : ""}`}>{n.body}</p>
          {long && (
            <button className="notice-more" onClick={() => setOpen(!open)}>
              {open ? "접기" : "더 보기"}
            </button>
          )}
        </>
      )}
      {canEdit && (
        <div className="dir-actions">
          <button className="btn btn-line btn-xs" disabled={busy} onClick={togglePin}>
            {n.pinned ? "고정 해제" : "📌 고정"}
          </button>
          <button className="btn btn-line btn-xs" disabled={busy} onClick={onEdit}>수정</button>
          <button className="btn btn-danger btn-xs dir-del" disabled={busy} onClick={remove}>삭제</button>
        </div>
      )}
    </div>
  );
}

function NoticeModal({ notice, onClose, onSaved }: { notice?: Notice; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [pinned, setPinned] = useState(notice?.pinned ?? false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await fetch(notice ? `/api/notices/${notice.id}` : "/api/notices", {
      method: notice ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, pinned }),
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
        <h2>{notice ? "공지 수정" : "공지 올리기"}</h2>
        {!notice && <p className="page-sub" style={{ marginTop: -4 }}>전체 구성원에게 알림이 갑니다.</p>}
        <form onSubmit={submit}>
          <div className="field">
            <label>제목</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 7월 전체 회의 안내" required />
          </div>
          <div className="field">
            <label>내용 (선택)</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder="공지 내용" />
          </div>
          <label className="notice-pin-check">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            목록 맨 위에 고정
          </label>
          {err && <p className="err-msg">{err}</p>}
          <div className="modal-actions">
            <button className="btn btn-primary" disabled={busy}>{busy ? "저장 중…" : notice ? "수정 저장" : "공지 올리기"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
