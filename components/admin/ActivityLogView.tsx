"use client";

import { useCallback, useEffect, useState } from "react";
import { Pagination } from "@/components/Pagination";

type Log = {
  id: string;
  actorName: string;
  action: "create" | "update" | "delete" | "status" | "login" | "approve";
  targetType: "task" | "directive" | "auth" | "event" | "reservation" | "user";
  targetTitle: string;
  meta: { status?: string; detail?: string };
  createdAt: string;
};

const ACTION_META: Record<Log["action"], { label: string; color: string }> = {
  create: { label: "등록", color: "var(--st-done)" },
  update: { label: "수정", color: "var(--primary)" },
  status: { label: "상태 변경", color: "var(--st-prog)" },
  delete: { label: "삭제", color: "var(--danger)" },
  login: { label: "로그인", color: "var(--primary)" },
  approve: { label: "승인", color: "var(--st-done)" },
};
const KIND_LABEL: Record<string, string> = {
  task: "업무", directive: "TODO", event: "행사", reservation: "예약", user: "사용자",
};
const STATUS_LABEL: Record<string, string> = {
  todo: "예정", in_progress: "진행중", done: "완료", hold: "보류",
};
const STAGE_LABEL: Record<string, string> = {
  planning: "기획", preparing: "준비", ongoing: "진행", done: "완료",
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

type Tab = "activity" | "login";

export default function ActivityLogView() {
  const [tab, setTab] = useState<Tab>("activity");
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback((t: Tab, p: number) => {
    setLoading(true);
    fetch(`/api/admin/activity?type=${t}&page=${p}`)
      .then((r) => (r.ok ? r.json() : { logs: [], total: 0 }))
      .then((d) => { setLogs(d.logs ?? []); setTotal(d.total ?? 0); setPageSize(d.pageSize ?? 20); })
      .catch(() => { setLogs([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(tab, page); }, [tab, page, load]);

  function changeTab(t: Tab) {
    if (t === tab) return;
    setTab(t);
    setPage(1); // 탭 바꾸면 1페이지로
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="seg log-tabs" role="tablist">
        <button className={tab === "activity" ? "on" : ""} onClick={() => changeTab("activity")}>활동</button>
        <button className={tab === "login" ? "on" : ""} onClick={() => changeTab("login")}>로그인</button>
      </div>

      {loading ? (
        <p className="muted-note">불러오는 중…</p>
      ) : logs.length === 0 ? (
        <p className="muted-note">{tab === "login" ? "아직 로그인 기록이 없습니다." : "아직 활동 기록이 없습니다."}</p>
      ) : (
        <>
        <div className="activity-list">
          {logs.map((l) => {
            const a = ACTION_META[l.action] ?? ACTION_META.update;
            if (l.action === "login") {
              return (
                <div className="activity-item" key={l.id}>
                  <span className="activity-badge" style={{ background: `color-mix(in srgb, ${a.color} 14%, transparent)`, color: a.color }}>
                    {a.label}
                  </span>
                  <div className="activity-body">
                    <div className="activity-text">
                      <strong>{l.actorName}</strong> 님이 로그인
                      {l.targetTitle && <span className="activity-sub"> · {l.targetTitle}</span>}
                    </div>
                    <div className="activity-time">{when(l.createdAt)}</div>
                  </div>
                </div>
              );
            }
            const kind = KIND_LABEL[l.targetType] ?? "업무";
            const statusLabel = l.action === "status" && l.meta?.status
              ? (l.targetType === "event" ? STAGE_LABEL[l.meta.status] : STATUS_LABEL[l.meta.status])
              : null;
            const detail = l.meta?.detail;
            return (
              <div className="activity-item" key={l.id}>
                <span className="activity-badge" style={{ background: `color-mix(in srgb, ${a.color} 14%, transparent)`, color: a.color }}>
                  {a.label}
                </span>
                <div className="activity-body">
                  <div className="activity-text">
                    <strong>{l.actorName}</strong> 님이 {kind}
                    <span className="activity-target"> “{l.targetTitle || "제목 없음"}”</span>
                    {l.action === "approve" ? <> 가입 승인</>
                      : statusLabel ? <> {l.targetType === "event" ? "단계를" : "상태를"} <b>{statusLabel}</b>(으)로 변경</>
                      : detail ? <> {detail}</>
                      : <> {a.label}</>}
                  </div>
                  <div className="activity-time">{when(l.createdAt)}</div>
                </div>
              </div>
            );
          })}
        </div>
        <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
      )}
    </div>
  );
}

