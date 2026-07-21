import { getServerSession } from "next-auth";
import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import { Category } from "@/models/Category";
import { authOptions } from "@/lib/auth";
import { canViewAllTeams, type SessionUser } from "@/lib/permissions";
import { LazyCalendarView as CalendarView } from "@/components/LazyLoad";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as SessionUser; // (main) 레이아웃에서 인증 보장

  await connectDB();
  const [all, cats] = await Promise.all([
    Team.find({ isActive: true }).sort({ createdAt: 1 }).lean(),
    Category.find({ isActive: true }).sort({ createdAt: 1 }).lean(),
  ]);

  // 조회 권한: 전사 역할(admin/과장/부과장/서기) → 전체 / 그 외 → 소속 팀만
  const visible = canViewAllTeams(user)
    ? all
    : all.filter((t: any) => user.teamId && String(t._id) === user.teamId);

  return (
    <CalendarView
      teams={visible.map((t: any) => ({
        id: String(t._id),
        name: t.name,
        slug: t.slug,
        color: t.color,
      }))}
      categories={cats.map((c: any) => ({ id: String(c._id), name: c.name, color: c.color }))}
    />
  );
}
