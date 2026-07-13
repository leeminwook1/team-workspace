"use client";

import { useEffect, useRef } from "react";

/**
 * 자동 새로고침 훅 — 데이터가 바뀌면 수동 새로고침 없이 반영되도록.
 * - 탭에 다시 돌아올 때(포커스·visibilitychange) 즉시 재조회
 * - 화면이 보이는 동안 intervalMs(기본 30초)마다 재조회
 * - 탭이 백그라운드면 폴링 중단 (서버 부하 방지)
 */
export function useAutoRefresh(refetch: () => void, intervalMs = 30_000) {
  const cbRef = useRef(refetch);
  cbRef.current = refetch;

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) cbRef.current();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(() => {
      if (!document.hidden) cbRef.current();
    }, intervalMs);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, [intervalMs]);
}
