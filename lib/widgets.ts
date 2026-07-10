// 홈 위젯 정의 — 서버(검증·기본배치)와 클라이언트(편집 UI)가 공유
export const WIDGET_IDS = [
  "minical", // 미니 달력 + 선택일 일정 (1d)
  "upcoming", // 다가오는 일정
  "progress", // 이번 달 진행 현황
  "todo", // 대기 중 TODO(지시)
  "reservations", // 오늘 자원 예약
  "duesoon", // 마감 임박 할 일
  "events", // 진행 중 행사
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];
export type WidgetSlot = { id: WidgetId; size: 1 | 2 };

export const WIDGET_META: Record<WidgetId, { label: string; desc: string }> = {
  minical: { label: "미니 달력", desc: "도트 달력 + 선택한 날짜의 일정" },
  upcoming: { label: "다가오는 일정", desc: "오늘 이후 예정된 일정" },
  progress: { label: "이번 달 진행 현황", desc: "완료·진행중·예정 비율" },
  todo: { label: "대기 중 TODO", desc: "처리 대기 중인 지시" },
  reservations: { label: "오늘 자원 예약", desc: "오늘 예약된 장비·자원" },
  duesoon: { label: "마감 임박 할 일", desc: "7일 내 마감인 행사 할 일" },
  events: { label: "진행 중 행사", desc: "행사별 준비 진행률" },
};

// 기본 배치 — 위젯을 한 번도 편집하지 않은 계정
export const DEFAULT_LAYOUT: WidgetSlot[] = [
  { id: "minical", size: 2 },
  { id: "upcoming", size: 1 },
  { id: "progress", size: 1 },
  { id: "todo", size: 1 },
  { id: "reservations", size: 1 },
];
