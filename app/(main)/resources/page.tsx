import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Resource } from "@/models/Resource";
import { Team } from "@/models/Team";
import "@/models/ResourceCategory";
import { ensureResourceCategories } from "@/lib/resourceCategories";
import ReservationBoard from "@/components/resources/ReservationBoard";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  await ensureResourceCategories();
  const [resources, teams] = await Promise.all([
    Resource.find({ isActive: true })
      .populate("categoryId", "name color order")
      .populate("ownerTeamId", "name color")
      .populate("managerId", "name")
      .sort({ name: 1 })
      .lean(),
    Team.find({ isActive: true }).sort({ createdAt: 1 }).lean(),
  ]);

  return (
    <div>
      <h1 className="page-title">자원 · 장비 예약</h1>
      <ReservationBoard
        resources={resources.map((r: any) => ({
          id: String(r._id),
          name: r.name,
          category: r.categoryId?.name
            ? { id: String(r.categoryId._id ?? r.categoryId), name: r.categoryId.name, color: r.categoryId.color || "#8b95a1", order: r.categoryId.order ?? 0 }
            : null,
          ownerTeam: r.ownerTeamId?.name ? { name: r.ownerTeamId.name, color: r.ownerTeamId.color } : null,
          manager: r.managerId?.name ? { id: String(r.managerId._id), name: r.managerId.name } : null,
          status: r.status ?? "available",
        }))}
        teams={teams.map((t: any) => ({ id: String(t._id), name: t.name, color: t.color }))}
      />
    </div>
  );
}
