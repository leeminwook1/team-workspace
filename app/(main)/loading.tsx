// (main) 그룹 공통 로딩 — 페이지 이동 시 서버 렌더를 기다리는 동안
// 즉시 스켈레톤을 보여줘 "무반응" 구간을 없앤다 (체감 속도 개선).
export default function Loading() {
  return (
    <div className="pg-skel" aria-hidden>
      <div className="pg-skel-bar w40" />
      <div className="pg-skel-bar w64 thin" />
      <div className="pg-skel-grid">
        <div className="pg-skel-card" />
        <div className="pg-skel-card" />
        <div className="pg-skel-card" />
      </div>
      <div className="pg-skel-block" />
    </div>
  );
}
