import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import CalendarView from "@/components/calendar/CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await connectDB();
  const teams = await Team.find({ isActive: true }).sort({ createdAt: 1 }).lean();

  return (
    <CalendarView
      teams={teams.map((t: any) => ({
        id: String(t._id),
        name: t.name,
        slug: t.slug,
        color: t.color,
      }))}
    />
  );
}
