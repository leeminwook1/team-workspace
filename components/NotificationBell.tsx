"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

type Noti = {
  id: string; type: string; title: string; body: string; link: string;
  read: boolean; createdAt: string;
};

const relTime = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
};

// 알림 종 — 안 읽은 개수 뱃지 + 드롭다운 알림함 (60초 폴링)
export default function NotificationBell() {
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [items, setItems] = useState<Noti[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const d = await res.json();
      setItems(d.notifications ?? []);
      setUnread(d.unread ?? 0);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // 패널 위치 — 버튼 아래, 화면 밖으로 나가지 않게
  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const W = 320;
      setPos({
        top: r.bottom + 8,
        left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)),
      });
      load();
    }
    setOpen((v) => !v);
  }

  async function markAll() {
    await fetch("/api/notifications", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }),
    }).catch(() => {});
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    setUnread(0);
  }

  async function onItemClick(n: Noti) {
    if (!n.read) {
      fetch("/api/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [n.id] }),
      }).catch(() => {});
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <>
      <button ref={btnRef} className="noti-btn" aria-label={`알림${unread ? ` ${unread}개` : ""}`} onClick={toggle}>
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="noti-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && createPortal(
        <>
          <div className="noti-backdrop" onClick={() => setOpen(false)} />
          <div className="noti-panel" style={{ top: pos.top, left: pos.left }}>
            <div className="noti-head">
              <b>알림</b>
              {unread > 0 && <button className="noti-readall" onClick={markAll}>모두 읽음</button>}
            </div>
            <div className="noti-list">
              {items.length === 0 && <p className="noti-empty">새 알림이 없어요.</p>}
              {items.map((n) => (
                <button key={n.id} className={`noti-item${n.read ? "" : " unread"}`} onClick={() => onItemClick(n)}>
                  <span className="noti-dot" aria-hidden />
                  <span className="noti-body">
                    <span className="noti-title">{n.title}</span>
                    {n.body && <span className="noti-sub">{n.body}</span>}
                    <span className="noti-time">{relTime(n.createdAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
