import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";
import type { SessionUser } from "./permissions";

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
