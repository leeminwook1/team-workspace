import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import { Event } from "@/models/Event";
import { Team } from "@/models/Team";
import { authOptions } from "@/lib/auth";
import { canManageEvents, type SessionUser } from "@/lib/permissions";
import EventKanban from "@/components/events/EventKanban";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session!.user as SessionUser;

  await connectDB();
  const ev: any = await Event.findById(params.id).lean();
  if (!ev) redirect("/events");

  // 수정 모달에서 팀 추가가 가능하도록 전체 활성 팀 전달
  const allTeams = await Team.find({ isActive: true }).sort({ createdAt: 1 }).lean();

  return (
    <EventKanban
      eventId={params.id}
      allTeams={allTeams.map((t: any) => ({ id: String(t._id), name: t.name, color: t.color }))}
      canManage={canManageEvents(user)}
    />
  );
}
