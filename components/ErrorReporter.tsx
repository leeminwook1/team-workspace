"use client";
import { useEffect } from "react";

// 전역 에러 리포터 — 화면 크래시(JS 에러·unhandled rejection)와 API 500 응답을
// /api/client-error 로 보고해 관리자 텔레그램으로 알림이 가게 한다.
// 세션당 최대 5건 + 같은 오류는 1번만 보고 (스팸 방지 — 서버에서도 10분 스로틀).

const reported = new Set<string>();
let budget = 5;

function report(kind: "js-error" | "unhandled-rejection" | "api-500", message: string, detail?: string) {
  const key = `${kind}:${message.slice(0, 80)}`;
  if (budget <= 0 || reported.has(key)) return;
  reported.add(key);
  budget--;
  try {
    // 원본 fetch 사용 — 아래 래핑된 fetch를 다시 타면 무한루프가 될 수 있어 분리
    (originalFetch ?? fetch)("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        message: message.slice(0, 500),
        detail: detail?.slice(0, 400),
        page: location.pathname.slice(0, 200),
      }),
      keepalive: true, // 페이지 이탈 직전 크래시도 전송 시도
    }).catch(() => {});
  } catch { /* 보고 실패는 무시 */ }
}

let originalFetch: typeof fetch | null = null;
let installed = false;

export default function ErrorReporter() {
  useEffect(() => {
    if (installed) return; // StrictMode 이중 마운트·라우트 전환에도 1번만 설치
    installed = true;

    window.addEventListener("error", (e) => {
      // 서드파티 스크립트·리소스 로드 오류는 제외 (message가 없는 경우)
      if (!e.message) return;
      report("js-error", e.message, e.error?.stack?.split("\n").slice(0, 2).join(" "));
    });
    window.addEventListener("unhandledrejection", (e) => {
      const r = e.reason;
      const msg = r instanceof Error ? r.message : String(r ?? "unknown");
      report("unhandled-rejection", msg, r instanceof Error ? r.stack?.split("\n").slice(0, 2).join(" ") : undefined);
    });

    // fetch 래핑 — /api/* 가 500대를 반환하면 보고 (client-error 자신은 제외)
    originalFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await originalFetch!(...args);
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
        if (res.status >= 500 && url.includes("/api/") && !url.includes("/api/client-error")) {
          report("api-500", `${url.split("?")[0]} → ${res.status}`);
        }
      } catch { /* 감지 실패는 무시 */ }
      return res;
    };
  }, []);

  return null;
}
