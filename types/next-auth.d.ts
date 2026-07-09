import "next-auth";
import "next-auth/jwt";

export type TeamMembership = { teamId: string; role: "leader" | "vice_leader" | "member" };
export type OrgRole = "admin" | "manager" | "deputy" | "secretary" | null;

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      orgRole: OrgRole;
      status: "pending" | "active" | "disabled";
      teams: TeamMembership[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    orgRole?: OrgRole;
    status?: "pending" | "active" | "disabled";
    teams?: TeamMembership[];
  }
}
