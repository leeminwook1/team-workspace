"use client";

// 목록/데이터 로드 실패 안내 + 다시 시도 — "데이터 없음"과 "불러오기 실패"를 구분해준다
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card" style={{ padding: 26, textAlign: "center" }}>
      <p style={{ margin: "0 0 12px", color: "var(--ink-soft)", fontSize: 14 }}>
        불러오지 못했어요. 네트워크 상태를 확인해주세요.
      </p>
      <button className="btn btn-line btn-sm" onClick={onRetry}>다시 시도</button>
    </div>
  );
}
