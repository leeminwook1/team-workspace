import { withAuth } from "next-auth/middleware";

// 로그인 필요 경로 — 역할(권한) 검증은 각 페이지·API에서 2차로 수행 (설계 3.3)
// pages.signIn을 명시하지 않으면 미인증 사용자가 NextAuth 기본 페이지로 튕겨나가고,
// 일부 환경(Edge 런타임의 NEXTAUTH_SECRET 미주입 등)에서 미들웨어 자체가 죽는 원인이 될 수 있음.
export default withAuth({
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export const config = {
  matcher: ["/calendar/:path*", "/admin/:path*", "/resources/:path*", "/pending"],
};
