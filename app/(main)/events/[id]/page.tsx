import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/mongodb";
import { Event } from "@/models/Event";
import { Team } from "@/models/Team";
import { authOptions } from "@/lib/auth";
import { canManageEvents, type SessionUser } from "@/lib/permissions";
import { LazyEventKanban as EventKanban } from "@/components/LazyLoad";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  // 잘못된 id로 접근 시 CastError 500 페이지 대신 목록으로
  if (!/^[0-9a-fA-F]{24}$/.test(params.id)) redirect("/events");

  const session = await getServerSession(authOptions);
  const user = session!.user as SessionUser;

  await connectDB();
  // 행사 존재 확인 + 팀 목록 — 독립 쿼리라 병렬로 (수정 모달에서 팀 추가용 전체 활성 팀 전달)
  const [ev, allTeams] = await Promise.all([
    Event.findById(params.id).lean() as Promise<any>,
    Team.find({ isActive: true }).sort({ createdAt: 1 }).lean(),
  ]);
  if (!ev) redirect("/events");

  return (
    <EventKanban
      eventId={params.id}
      allTeams={allTeams.map((t: any) => ({ id: String(t._id), name: t.name, color: t.color }))}
      canManage={canManageEvents(user)}
    />
  );
}
