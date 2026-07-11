import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "./mongodb";
import { User } from "@/models/User";
import { logLogin } from "./activity";
import { isBlocked, recordFailure, clearFailures, clientIp } from "./rateLimit";

// 설계 5장 — Credentials 로그인 + JWT 세션.
// jwt 콜백에서 매번 DB의 최신 역할/상태를 반영 → 승인 즉시 세션에 반영됨.
export const authOptions: NextAuthOptions = {
  // maxAge: 마지막 활동 후 2시간 지나면 세션 만료 → 재로그인 필요
  // (사용 중에는 세션 조회 시마다 만료가 연장되는 롤링 방식)
  session: { strategy: "jwt", maxAge: 2 * 60 * 60 },
  pages: { signIn: "/login" },
  events: {
    // 로그인 성공 시 로그인 로그 기록 (실패해도 로그인 자체엔 영향 없음)
    async signIn({ user }) {
      if (user?.id) await logLogin({ actorId: user.id, actorName: user.name, email: user.email });
    },
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(creds, req) {
        if (!creds?.email || !creds?.password) return null;

        // 무차별 대입 방어 — 같은 IP에서 15분 내 실패 10회면 차단 (성공 시 초기화)
        const key = `login:${clientIp((req?.headers ?? {}) as Record<string, string | undefined>)}`;
        const FAIL_LIMIT = 10, FAIL_WINDOW = 15 * 60 * 1000;
        if (isBlocked(key, FAIL_LIMIT)) return null;

        await connectDB();
        const user: any = await User.findOne({ email: creds.email.toLowerCase() }).lean();
        const ok = user ? await bcrypt.compare(creds.password, user.passwordHash) : false;
        if (!user || !ok || user.status === "disabled") {
          recordFailure(key, FAIL_WINDOW);
          return null;
        }
        clearFailures(key);
        return { id: String(user._id), name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    // 성능: 매 요청마다 DB를 치지 않고, 로그인/명시적 갱신/60초 경과 시에만 역할·상태를 새로고침.
    // (승인·권한 변경은 최대 60초 뒤 반영 — 즉시 반영이 필요하면 재로그인)
    async jwt({ token, user, trigger }) {
      const now = Date.now();
      const STALE_MS = 60_000;
      const needsRefresh =
        !!user || trigger === "update" || !token.refreshedAt || now - (token.refreshedAt as number) > STALE_MS;

      if (token?.sub && needsRefresh) {
        await connectDB();
        const u: any = await User.findById(token.sub).lean();
        if (u) {
          token.name = u.name;
          token.role = u.role ?? "member";
          token.teamId = u.teamId ? String(u.teamId) : null;
          token.status = u.status;
          token.refreshedAt = now;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = (token.role as any) ?? "member";
        session.user.teamId = (token.teamId as any) ?? null;
        session.user.status = (token.status as any) ?? "pending";
      }
      return session;
    },
  },
};
