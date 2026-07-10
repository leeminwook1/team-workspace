import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import { Event } from "@/models/Event";
import "@/models/Team";
import { authOptions } from "@/lib/auth";
import { canManageEvents, type SessionUser } from "@/lib/permissions";
import EventKanban from "@/components/events/EventKanban";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session!.user as SessionUser;

  await connectDB();
  const ev: any = await Event.findById(params.id).populate("teamIds", "name color").lean();
  if (!ev) redirect("/events");

  return (
    <EventKanban
      eventId={params.id}
      teams={(ev.teamIds ?? []).filter(Boolean).map((t: any) => ({ id: String(t._id), name: t.name, color: t.color }))}
      canManage={canManageEvents(user)}
    />
  );
}
