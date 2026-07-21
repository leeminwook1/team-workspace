"use client";
import dynamic from "next/dynamic";

// FullCalendar를 쓰는 무거운 화면들을 지연 로드 — 페이지 셸을 먼저 그리고
// 달력 번들은 뒤따라 로드한다 (SSR 불필요: 어차피 클라이언트에서 데이터를 fetch하는 컴포넌트들).
// 서버 컴포넌트 페이지에서는 ssr:false dynamic을 직접 못 쓰므로 이 클라이언트 래퍼를 통해 임포트한다.

const loading = () => <p className="muted-note">불러오는 중…</p>;

export const LazyCalendarView = dynamic(() => import("@/components/calendar/CalendarView"), { ssr: false, loading });
export const LazyPersonalCalendar = dynamic(() => import("@/components/personal/PersonalCalendar"), { ssr: false, loading });
export const LazyTeamBoard = dynamic(() => import("@/components/team/TeamBoard"), { ssr: false, loading });
export const LazyEventKanban = dynamic(() => import("@/components/events/EventKanban"), { ssr: false, loading });
