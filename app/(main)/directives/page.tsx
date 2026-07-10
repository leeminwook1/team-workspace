import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import { authOptions } from "@/lib/auth";
import { canUseDirectives, canCreateDirective, type SessionUser } from "@/lib/permissions";
import DirectiveBoard from "@/components/directives/DirectiveBoard";

export const dynamic = "force-dynamic";

export default async function DirectivesPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as SessionUser; // (main) 레이아웃에서 인증 보장
  if (!canUseDirectives(user)) redirect("/calendar");

  await connectDB();
  const teams = await Team.find({ isActive: true }).sort({ createdAt: 1 }).lean();

  return (
    <DirectiveBoard
      teams={teams.map((t: any) => ({ id: String(t._id), name: t.name, color: t.color }))}
      canCreate={canCreateDirective(user)}
    />
  );
}
