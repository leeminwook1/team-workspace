"use client";

import { useEffect, useState } from "react";

type Log = {
  id: string;
  actorName: string;
  action: "create" | "update" | "delete" | "status";
  targetType: "task" | "directive";
  targetTitle: string;
  meta: { status?: string };
  createdAt: string;
};

const ACTION_META: Record<Log["action"], { label: string; color: string }> = {
  create: { label: "등록", color: "var(--st-done)" },
  update: { label: "수정", color: "var(--primary)" },
  status: { label: "상태 변경", color: "var(--st-prog)" },
  delete: { label: "삭제", color: "var(--danger)" },
};
const STATUS_LABEL: Record<string, string> = {
  todo: "예정", in_progress: "진행중", done: "완료", hold: "보류",
};

function when(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ActivityLogView() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/activity")
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((d) => setLogs(d.logs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted-note">불러오는 중…</p>;
  if (logs.length === 0) return <p className="muted-note">아직 활동 기록이 없습니다.</p>;

  return (
    <div className="activity-list">
      {logs.map((l) => {
        const a = ACTION_META[l.action] ?? ACTION_META.update;
        const kind = l.targetType === "directive" ? "TODO" : "업무";
        const statusLabel = l.action === "status" && l.meta?.status ? STATUS_LABEL[l.meta.status] : null;
        return (
          <div className="activity-item" key={l.id}>
            <span className="activity-badge" style={{ background: `color-mix(in srgb, ${a.color} 14%, transparent)`, color: a.color }}>
              {a.label}
            </span>
            <div className="activity-body">
              <div className="activity-text">
                <strong>{l.actorName}</strong> 님이 {kind}
                <span className="activity-target"> “{l.targetTitle || "제목 없음"}”</span>
                {statusLabel ? <> 상태를 <b>{statusLabel}</b>(으)로 변경</> : <> {a.label}</>}
              </div>
              <div className="activity-time">{when(l.createdAt)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
