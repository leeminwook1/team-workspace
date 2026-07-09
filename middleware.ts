export { default } from "next-auth/middleware";

// 로그인 필요 경로 — 역할(권한) 검증은 각 페이지·API에서 2차로 수행 (설계 3.3)
export const config = {
  matcher: ["/calendar/:path*", "/admin/:path*", "/resources/:path*", "/pending"],
};
