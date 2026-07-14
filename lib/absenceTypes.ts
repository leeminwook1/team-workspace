// 부재 유형 — 서버(모델·API)와 클라이언트(UI)가 공유하는 순수 상수
export const ABSENCE_TYPES = ["vacation", "half_am", "half_pm", "business", "training", "etc"] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

export const ABSENCE_LABEL: Record<AbsenceType, string> = {
  vacation: "연차",
  half_am: "오전 반차",
  half_pm: "오후 반차",
  business: "출장",
  training: "교육·행사",
  etc: "기타",
};

// 반차는 하루짜리 — 종료일 입력을 잠글 때 사용
export const HALF_DAY_TYPES: AbsenceType[] = ["half_am", "half_pm"];
