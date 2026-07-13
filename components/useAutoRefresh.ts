"use client";

import { useEffect, useRef } from "react";

/**
 * 자동 반영 — 데이터가 바뀌면 새로고침 없이 즉시(최대 5초) 적용.
 *
 * 동작: 서버는 변경이 생길 때마다 종류별 타임스탬프를 남기고(/api/changes),
 * 브라우저는 5초마다 그 신호만 확인한다(초경량 요청). 바뀐 종류가 있을 때만
 * 실제 데이터를 다시 불러오므로, 즉시성에 가깝고 서버 부담은 적다.
 * - 탭이 백그라운드면 확인 중단, 돌아오면 즉시 확인
 * - 안전망: 신호를 놓쳐도 3분에 한 번은 강제 갱신
 *
 * 페이지에 여러 컴포넌트가 있어도 신호 확인은 탭당 1회로 공유된다(싱글턴).
 */

type Sub = { kinds: string[] | null; cb: () => void; lastRun: number };

const subs = new Set<Sub>();
let lastSeen: Record<string, number> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let checking = false;

const FALLBACK_MS = 180_000; // 안전망 강제 갱신 주기

async function check() {
  if (typeof document === "undefined" || document.hidden || checking || subs.size === 0) return;
  checking = true;
  try {
    const res = await fetch("/api/changes", { cache: "no-store" });
    if (!res.ok) return;
    const cur: Record<string, number> = (await res.json()).changes ?? {};
    const prev = lastSeen;
    lastSeen = cur;
    // 첫 확인은 기준점만 잡는다 (직후에 갱신할 이유 없음)
    const changed = prev ? Object.keys(cur).filter((k) => cur[k] !== prev[k]) : [];
    const now = Date.now();
    subs.forEach((s) => {
      const hit =
        (changed.length > 0 && (!s.kinds || s.kinds.some((k) => changed.includes(k)))) ||
        now - s.lastRun > FALLBACK_MS;
      if (hit) {
        s.lastRun = now;
        try { s.cb(); } catch { /* 개별 콜백 실패가 다른 구독을 막지 않게 */ }
      }
    });
  } catch {
    // 네트워크 오류 — 다음 주기에 재시도
  } finally {
    checking = false;
  }
}

function onWake() {
  if (!document.hidden) check();
}

function ensureLoop() {
  if (timer) return;
  timer = setInterval(check, 5_000);
  window.addEventListener("focus", onWake);
  document.addEventListener("visibilitychange", onWake);
}

function stopIfIdle() {
  if (subs.size > 0 || !timer) return;
  clearInterval(timer);
  timer = null;
  window.removeEventListener("focus", onWake);
  document.removeEventListener("visibilitychange", onWake);
}

/**
 * @param refetch 데이터 재조회 함수
 * @param kinds 반응할 변경 종류 (생략 = 모든 변경에 반응)
 *   task | directive | event | reservation | user | personal
 */
export function useAutoRefresh(refetch: () => void, kinds?: string[]) {
  const cbRef = useRef(refetch);
  cbRef.current = refetch;
  const kindsKey = kinds?.join(",") ?? "";

  useEffect(() => {
    const sub: Sub = {
      kinds: kindsKey ? kindsKey.split(",") : null,
      cb: () => cbRef.current(),
      lastRun: Date.now(),
    };
    subs.add(sub);
    ensureLoop();
    return () => {
      subs.delete(sub);
      stopIfIdle();
    };
  }, [kindsKey]);
}
