import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";
import { CANONICAL_ORIGIN, isRetiredDeployment } from "@/lib/deployment";

// 로그인 필요 경로 — 역할(권한) 검증은 각 페이지·API에서 2차로 수행 (설계 3.3)
// pages.signIn을 명시하지 않으면 미인증 사용자가 NextAuth 기본 페이지로 튕겨나가고,
// 일부 환경(Edge 런타임의 NEXTAUTH_SECRET 미주입 등)에서 미들웨어 자체가 죽는 원인이 될 수 있음.
const auth = withAuth({
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
});

const PROTECTED = [/^\/calendar(\/|$)/, /^\/admin(\/|$)/, /^\/resources(\/|$)/, /^\/pending$/];

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  // 옛 Vercel 프로젝트 배포 — 모든 요청(API·크론 포함)을 새 주소로 보낸다
  if (isRetiredDeployment(req.headers.get("host"))) {
    const to = new URL(req.nextUrl.pathname + req.nextUrl.search, CANONICAL_ORIGIN);
    return NextResponse.redirect(to, 308);
  }
  if (PROTECTED.some((r) => r.test(req.nextUrl.pathname))) {
    return auth(req as NextRequestWithAuth, ev);
  }
  return NextResponse.next();
}

export const config = {
  // 정적 리소스 제외 전 경로 — 은퇴 배포 판별을 위해 API까지 포함
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
