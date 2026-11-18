// 보낸 표시(task.notice)가 "지금 일정 기준으로" 유효한지 — 일정 시간이 바뀌면 표시는 무효가 되어 다시 보낸다.
//  eveAt  : 현재 시작 시각의 16시간 전 ~ 시작 시각 사이에 보낸 것만 유효 (전날 19~22시 안내)
//  wrapAt : 현재 종료 시각(종일은 그날 자정) 이후에 보낸 것만 유효

const EVE_SPAN = 16 * 3600_000;

export function eveValid(eveAt: Date | null | undefined, startDate: Date) {
  if (!eveAt) return false;
  const t = new Date(eveAt).getTime(), s = new Date(startDate).getTime();
  return t <= s && t >= s - EVE_SPAN;
}

export function wrapValid(wrapAt: Date | null | undefined, windowEnd: Date) {
  return !!wrapAt && new Date(wrapAt).getTime() >= new Date(windowEnd).getTime();
}
