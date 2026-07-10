import { getServerSession } from "next-auth";
import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import { authOptions } from "@/lib/auth";
import { canManageEvents, type SessionUser } from "@/lib/permissions";
import EventBoard from "@/components/events/EventBoard";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as SessionUser; // (main) 레이아웃에서 인증 보장

  await connectDB();
  const teams = await Team.find({ isActive: true }).sort({ createdAt: 1 }).lean();

  return (
    <EventBoard
      teams={teams.map((t: any) => ({ id: String(t._id), name: t.name, color: t.color }))}
      canManage={canManageEvents(user)}
    />
  );
}
