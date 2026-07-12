import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canManageTeams, type SessionUser } from "@/lib/permissions";
import { connectDB } from "@/lib/mongodb";
import { Resource } from "@/models/Resource";
import { ResourceCategory } from "@/models/ResourceCategory";
import { Team } from "@/models/Team";
import "@/models/User";
import { ensureResourceCategories } from "@/lib/resourceCategories";
import ResourceManager from "@/components/admin/ResourceManager";

export const dynamic = "force-dynamic";

export default async function AdminResourcesPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canManageTeams(session.user as SessionUser)) redirect("/calendar");

  await ensureResourceCategories();
  const [resources, categories, teams] = await Promise.all([
    Resource.find()
      .populate("categoryId", "name color")
      .populate("ownerTeamId", "name color")
      .populate("managerId", "name")
      .sort({ name: 1 })
      .lean(),
    ResourceCategory.find().sort({ order: 1, name: 1 }).lean(),
    Team.find({ isActive: true }).sort({ createdAt: 1 }).lean(),
  ]);

  return (
    <ResourceManager
      initialCategories={categories.map((c: any) => ({ id: String(c._id), name: c.name, color: c.color || "#8b95a1", isActive: c.isActive }))}
      teams={teams.map((t: any) => ({ id: String(t._id), name: t.name, color: t.color }))}
      initialResources={resources.map((r: any) => ({
        id: String(r._id),
        name: r.name,
        category: r.categoryId?.name ? { id: String(r.categoryId._id ?? r.categoryId), name: r.categoryId.name } : null,
        ownerTeam: r.ownerTeamId?.name ? { id: String(r.ownerTeamId._id), name: r.ownerTeamId.name, color: r.ownerTeamId.color } : null,
        manager: r.managerId?.name ? { id: String(r.managerId._id), name: r.managerId.name } : null,
        isActive: r.isActive,
      }))}
    />
  );
}
