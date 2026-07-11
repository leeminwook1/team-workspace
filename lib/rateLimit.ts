// 인메모리 슬라이딩 윈도우 rate limit — 무차별 대입·스팸 방어.
// 서버리스에선 인스턴스별로 카운트되지만(완벽 차단은 아님) 공격 속도를 크게 늦추는 데 충분하다.
// 외부 저장소(Redis) 없이 동작하는 게 목표라 의도적으로 단순하게 유지.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// 메모리 누수 방지 — 버킷이 많아지면 만료된 것부터 정리
function sweep() {
  if (buckets.size < 1000) return;
  const now = Date.now();
  buckets.forEach((b, k) => {
    if (b.resetAt <= now) buckets.delete(k);
  });
}

/** 호출 자체를 카운트. limit 초과 시 차단 (가입 신청 등 시도 횟수 제한용) */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  sweep();
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > limit) return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, retryAfterSec: 0 };
}

/** 실패 누적형(로그인) — 실패만 기록하고, limit 이상 쌓이면 차단. 성공 시 clearFailures로 초기화 */
export function isBlocked(key: string, limit: number): boolean {
  const b = buckets.get(key);
  return !!b && b.resetAt > Date.now() && b.count >= limit;
}

export function recordFailure(key: string, windowMs: number) {
  sweep();
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + windowMs });
  else b.count += 1;
}

export function clearFailures(key: string) {
  buckets.delete(key);
}

/** 프록시(Vercel) 뒤에서 클라이언트 IP 추출 */
export function clientIp(headers: Headers | Record<string, string | string[] | undefined>): string {
  const get = (k: string) => {
    if (headers instanceof Headers) return headers.get(k) ?? "";
    const v = headers[k];
    return Array.isArray(v) ? v[0] : (v ?? "");
  };
  const fwd = get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return get("x-real-ip") || "unknown";
}
