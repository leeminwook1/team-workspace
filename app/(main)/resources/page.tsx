import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Resource } from "@/models/Resource";
import { Team } from "@/models/Team";
import ReservationBoard from "@/components/resources/ReservationBoard";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  await connectDB();
  const [resources, teams] = await Promise.all([
    Resource.find({ isActive: true }).sort({ category: 1, name: 1 }).lean(),
    Team.find({ isActive: true }).sort({ createdAt: 1 }).lean(),
  ]);

  return (
    <div>
      <h1 className="page-title">자원 · 장비 예약</h1>
      <ReservationBoard
        resources={resources.map((r: any) => ({
          id: String(r._id),
          name: r.name,
          category: r.category,
        }))}
        teams={teams.map((t: any) => ({ id: String(t._id), name: t.name, color: t.color }))}
      />
    </div>
  );
}
