import "next-auth";
import "next-auth/jwt";

export type Role = "admin" | "manager" | "deputy" | "secretary" | "leader" | "vice_leader" | "member";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
      teamId: string | null;
      status: "pending" | "active" | "disabled";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    teamId?: string | null;
    status?: "pending" | "active" | "disabled";
    refreshedAt?: number;
  }
}
