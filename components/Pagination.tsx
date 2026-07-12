"use client";

import { Icon } from "@/components/icons";

// 공용 페이지네이션 — 현재 페이지 ±2 표시, 양끝 생략(…) 처리
export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  let start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  start = Math.max(1, end - 4);
  const nums = [];
  for (let i = start; i <= end; i++) nums.push(i);

  return (
    <div className="pager">
      <button className="pager-arrow" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="이전">
        <Icon name="chevronL" size={15} />
      </button>
      {start > 1 && <button className="pager-num" onClick={() => onPage(1)}>1</button>}
      {start > 2 && <span className="pager-gap">…</span>}
      {nums.map((n) => (
        <button key={n} className={`pager-num${n === page ? " on" : ""}`} onClick={() => onPage(n)}>{n}</button>
      ))}
      {end < totalPages - 1 && <span className="pager-gap">…</span>}
      {end < totalPages && <button className="pager-num" onClick={() => onPage(totalPages)}>{totalPages}</button>}
      <button className="pager-arrow" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="다음">
        <Icon name="chevronR" size={15} />
      </button>
    </div>
  );
}
