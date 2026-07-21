import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";
import type { SessionUser } from "./permissions";
import { rateLimit } from "./rateLimit";

// 설계 3.3 — 모든 API에서 세션+역할 검증 (프론트 숨김은 UX일 뿐)
export async function requireActiveUser(): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { user: null, error: json({ error: "로그인이 필요합니다." }, 401) };
  }
  if (session.user.status !== "active") {
    return { user: null, error: json({ error: "승인 대기 중인 계정입니다." }, 403) };
  }
  return { user: session.user as SessionUser, error: null };
}

export function json(data: unknown, status = 200) {
  return NextResponse.json({ success: status < 400, ...(data as object) }, { status });
}

// [id] 라우트 공통 가드 — ObjectId 형식이 아니면 400 응답을 반환(그대로 return), 정상이면 null.
// 검증 없이 Mongoose에 넘기면 CastError로 500(비-JSON)이 나 클라이언트 처리도 지저분해진다.
export function badId(id: string): NextResponse | null {
  return /^[0-9a-fA-F]{24}$/.test(id) ? null : json({ error: "잘못된 요청입니다." }, 400);
}

// 쓰기 rate limit — 초과 시 429 응답을 반환(그대로 return), 통과면 null.
// 알림·대량 생성 유발 엔드포인트(피드백·공지·댓글·참여·검색)의 스팸 방어용.
export async function limitWrites(key: string, limit: number, windowMs: number): Promise<NextResponse | null> {
  const rl = await rateLimit(key, limit, windowMs);
  if (rl.ok) return null;
  const s = rl.retryAfterSec;
  const when = s >= 60 ? `${Math.ceil(s / 60)}분` : `${Math.max(1, s)}초`;
  return json({ error: `요청이 너무 잦아요. ${when} 뒤 다시 시도해주세요.` }, 429);
}
