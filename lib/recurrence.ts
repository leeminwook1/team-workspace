// 반복 일정 오커런스 날짜 계산 — 생성(API)과 롤링 연장(크론)이 공유

// 반복 오커런스 시작일 계산 — monthly는 말일 클램프 (1/31 → 2/28)
export function addInterval(d: Date, repeat: string, n: number): Date {
  if (repeat === "daily") return new Date(d.getTime() + n * 86_400_000);
  if (repeat === "weekly") return new Date(d.getTime() + n * 7 * 86_400_000);
  if (repeat === "biweekly") return new Date(d.getTime() + n * 14 * 86_400_000);
  // monthly
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m + n, Math.min(day, lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
}

// 한 번에 미리 만들어 둘 오커런스 상한 — 나머지는 크론이 이어서 생성
export const RECUR_BATCH_CAP = 60;
