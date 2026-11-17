// 촬영 진행 단계 — 촬영 → 백업 → 셀렉 → 보정 → 보고 (서버·클라이언트 공용)

export const PIPELINE_STEPS = [
  { key: "shoot", label: "촬영" },
  { key: "backup", label: "백업" },
  { key: "select", label: "셀렉" },
  { key: "retouch", label: "보정" },
  { key: "report", label: "보고" },
] as const;

export type StepKey = (typeof PIPELINE_STEPS)[number]["key"];
export const STEP_KEYS = PIPELINE_STEPS.map((s) => s.key) as StepKey[];
export const STEP_LABEL: Record<StepKey, string> = Object.fromEntries(PIPELINE_STEPS.map((s) => [s.key, s.label])) as any;

export type PipelineState = {
  on: boolean;
  steps: Partial<Record<StepKey, string | Date | null>>; // 완료 시각 (null = 미완료)
  reportDue: string | Date | null; // 보고 마감
  selectDue: string | Date | null; // 셀렉 마감 (선택)
};

/** 다음에 할 단계 (전부 끝났으면 null) */
export function nextStep(p: PipelineState | null | undefined): StepKey | null {
  if (!p?.on) return null;
  return STEP_KEYS.find((k) => !p.steps?.[k]) ?? null;
}

/** 완료한 단계 수 (0~5) */
export function doneCount(p: PipelineState | null | undefined) {
  if (!p?.on) return 0;
  return STEP_KEYS.filter((k) => !!p.steps?.[k]).length;
}

/** 촬영 카테고리면 진행 관리 자동 켜기 */
export function isShootCategory(name?: string | null) {
  return !!name && name.includes("촬영");
}

/** 보고 마감 기본값 — 일정 끝난 날로부터 7일 */
export function defaultReportDue(endDate: Date) {
  return new Date(endDate.getTime() + 7 * 86_400_000);
}

/** API 응답용 — 꺼져 있으면 null */
export function serializePipeline(p: any): PipelineState | null {
  if (!p?.on) return null;
  return {
    on: true,
    steps: Object.fromEntries(STEP_KEYS.map((k) => [k, p.steps?.[k] ?? null])),
    reportDue: p.reportDue ?? null,
    selectDue: p.selectDue ?? null,
  };
}
