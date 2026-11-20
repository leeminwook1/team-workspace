// 반복 규칙 (서버·웹 공용)
//  daily · weekly · biweekly · monthly          — 기본
//  d<N>  — N일마다 (2~60)    예) d3 = 3일마다
//  w<N>  — N주마다 (2~12)    예) w3 = 3주마다
//  dates — 날짜 직접 지정 (규칙 없음 — 고른 날짜만, 크론이 이어서 만들지 않음)

export const REPEAT_RE = /^(none|daily|weekly|biweekly|monthly|dates|d([2-9]|[1-5]\d|60)|w([2-9]|1[0-2]))$/;
/** DB에 저장되는 repeatFreq 형식 (none 제외) */
export const REPEAT_FREQ_RE = /^(daily|weekly|biweekly|monthly|dates|d\d{1,2}|w\d{1,2})$/;
export const MAX_REPEAT_DATES = 60;

const BASE: Record<string, string> = { daily: "매일", weekly: "매주", biweekly: "격주", monthly: "매월", dates: "날짜 지정" };

export function repeatLabel(freq?: string | null) {
  if (!freq || freq === "none") return "반복 없음";
  if (BASE[freq]) return BASE[freq];
  const m = freq.match(/^([dw])(\d+)$/);
  if (m) return `${m[2]}${m[1] === "d" ? "일" : "주"}마다`;
  return "반복";
}

/** 규칙 반복 n번째 회차까지의 날짜 간격(일) — d/w 형식만. 그 외는 null */
export function intervalDays(freq: string): number | null {
  const m = freq.match(/^([dw])(\d+)$/);
  if (!m) return null;
  return Number(m[2]) * (m[1] === "w" ? 7 : 1);
}

const KST = 9 * 3600_000;
const DAY = 86_400_000;
const kstDayUTC = (d: Date) => { const k = new Date(d.getTime() + KST); return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()); };

/**
 * 날짜 직접 지정 — 시작 일정과 같은 시각·길이로 고른 날짜마다 회차를 만든다 (시작일 포함, 중복 제거, 날짜순).
 * 종일 일정은 "날짜 = UTC 자정" 저장 규칙을 따른다. 시작일보다 앞선 날짜가 있으면 { error }.
 */
export function dateOccurrences(start: Date, end: Date, allDay: boolean, dates: string[]):
  { list: { startDate: Date; endDate: Date }[] } | { error: string } {
  const duration = end.getTime() - start.getTime();
  const baseDay = allDay ? Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()) : kstDayUTC(start);
  const days = new Set<number>([baseDay]);
  for (const s of dates) {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return { error: "날짜 형식이 잘못됐습니다." };
    const day = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    if (isNaN(day)) return { error: "날짜 형식이 잘못됐습니다." };
    if (day < baseDay) return { error: "반복 날짜는 시작일 이후로 골라주세요." };
    if (day > baseDay + 366 * DAY) return { error: "반복 날짜는 1년 안으로 골라주세요." };
    days.add(day);
  }
  if (days.size > MAX_REPEAT_DATES) return { error: `날짜는 ${MAX_REPEAT_DATES}개까지 고를 수 있어요.` };
  const list = Array.from(days).sort((a, b) => a - b).map((day) => {
    const s = new Date(start.getTime() + (day - baseDay)); // KST엔 서머타임이 없어 일 단위 차이 그대로 이동
    return { startDate: s, endDate: new Date(s.getTime() + duration) };
  });
  return { list };
}
