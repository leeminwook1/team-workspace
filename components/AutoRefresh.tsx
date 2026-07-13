"use client";

import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/components/useAutoRefresh";

// 서버 컴포넌트 페이지(홈·팀 현황·관리자 등)용 — 변경 신호가 오면 서버 데이터를 다시 렌더
export default function AutoRefresh({ kinds }: { kinds?: string[] }) {
  const router = useRouter();
  useAutoRefresh(() => router.refresh(), kinds);
  return null;
}
