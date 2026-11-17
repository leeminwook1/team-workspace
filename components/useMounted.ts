"use client";
import { useEffect, useState } from "react";

// 브라우저에 마운트된 뒤에만 true — 서버(UTC)와 브라우저(KST)의 날짜 계산이 달라
// hydration 불일치(React #418)가 나는 위젯은 마운트 후에 그린다.
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
