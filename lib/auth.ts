import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "./mongodb";
import { User } from "@/models/User";

// 설계 5장 — Credentials 로그인 + JWT 세션.
// jwt 콜백에서 매번 DB의 최신 역할/상태를 반영 → 승인 즉시 세션에 반영됨.
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;
        await connectDB();
        const user: any = await User.findOne({ email: creds.email.toLowerCase() }).lean();
        if (!user) return null;
        const ok = await bcrypt.compare(creds.password, user.passwordHash);
        if (!ok) return null;
        if (user.status === "disabled") return null; // 비활성 계정 차단
        return { id: String(user._id), name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token }) {
      if (token?.sub) {
        await connectDB();
        const u: any = await User.findById(token.sub).lean();
        if (u) {
          token.name = u.name;
          token.orgRole = u.orgRole ?? null;
          token.status = u.status;
          token.teams = (u.teams ?? []).map((t: any) => ({
            teamId: String(t.teamId),
            role: t.role,
          }));
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.orgRole = (token.orgRole as any) ?? null;
        session.user.status = (token.status as any) ?? "pending";
        session.user.teams = (token.teams as any) ?? [];
      }
      return session;
    },
  },
};
