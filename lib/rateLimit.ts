// 슬라이딩 윈도우 rate limit — 무차별 대입·스팸 방어.
// UPSTASH_REDIS_REST_URL/TOKEN 이 설정되면 공유 저장소(Redis)로 동작해
// 서버리스 인스턴스가 여러 개여도 한도가 희석되지 않는다.
// 미설정 시(또는 Redis 오류 시) 인메모리로 폴백 — 인스턴스별 카운트지만 공격 속도를 늦추는 데 충분.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const redisEnabled = !!(REDIS_URL && REDIS_TOKEN);

async function redis(cmd: (string | number)[]): Promise<any> {
  const res = await fetch(REDIS_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json()).result;
}

// 메모리 누수 방지 — 버킷이 많아지면 만료된 것부터 정리
function sweep() {
  if (buckets.size < 1000) return;
  const now = Date.now();
  buckets.forEach((b, k) => {
    if (b.resetAt <= now) buckets.delete(k);
  });
}

function memRateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
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

/** 호출 자체를 카운트. limit 초과 시 차단 (가입 신청·연동 코드 등 시도 횟수 제한용) */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfterSec: number }> {
  if (redisEnabled) {
    try {
      const k = `rl:${key}`;
      const count: number = await redis(["INCR", k]);
      if (count === 1) await redis(["PEXPIRE", k, windowMs]);
      if (count > limit) {
        const ttl: number = await redis(["PTTL", k]);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil(ttl / 1000)) };
      }
      return { ok: true, retryAfterSec: 0 };
    } catch {
      // Redis 장애 시 요청을 막지 않고 메모리로 폴백
    }
  }
  return memRateLimit(key, limit, windowMs);
}

/** 실패 누적형(로그인) — 실패만 기록하고, limit 이상 쌓이면 차단. 성공 시 clearFailures로 초기화 */
export async function isBlocked(key: string, limit: number): Promise<boolean> {
  if (redisEnabled) {
    try {
      const count = await redis(["GET", `rl:${key}`]);
      return Number(count ?? 0) >= limit;
    } catch { /* 폴백 */ }
  }
  const b = buckets.get(key);
  return !!b && b.resetAt > Date.now() && b.count >= limit;
}

export async function recordFailure(key: string, windowMs: number): Promise<void> {
  if (redisEnabled) {
    try {
      const k = `rl:${key}`;
      const count: number = await redis(["INCR", k]);
      if (count === 1) await redis(["PEXPIRE", k, windowMs]);
      return;
    } catch { /* 폴백 */ }
  }
  sweep();
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + windowMs });
  else b.count += 1;
}

export async function clearFailures(key: string): Promise<void> {
  if (redisEnabled) {
    try { await redis(["DEL", `rl:${key}`]); return; } catch { /* 폴백 */ }
  }
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
