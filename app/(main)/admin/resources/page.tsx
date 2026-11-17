import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canManageTeams, type SessionUser } from "@/lib/permissions";
import { connectDB } from "@/lib/mongodb";
import { Resource } from "@/models/Resource";
import { ResourceCategory } from "@/models/ResourceCategory";
import { User } from "@/models/User";
import { getDeptId } from "@/lib/dept";
import { ensureResourceCategories } from "@/lib/resourceCategories";
import ResourceManager from "@/components/admin/ResourceManager";

export const dynamic = "force-dynamic";

export default async function AdminResourcesPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canManageTeams(session.user as SessionUser)) redirect("/calendar");

  await ensureResourceCategories();
  const [resources, categories, members] = await Promise.all([
    Resource.find()
      .populate("categoryId", "name color")
      .populate("managerId", "name")
      .sort({ name: 1 })
      .lean(),
    ResourceCategory.find().sort({ order: 1, name: 1 }).lean(),
    getDeptId().then((dept) => User.find({ status: "active", teamId: dept }).select("name").sort({ name: 1 }).lean()),
  ]);

  return (
    <ResourceManager
      initialCategories={categories.map((c: any) => ({ id: String(c._id), name: c.name, color: c.color || "#8b95a1", isActive: c.isActive }))}
      members={(members as any[]).map((m) => ({ id: String(m._id), name: m.name }))}
      initialResources={resources.map((r: any) => ({
        id: String(r._id),
        name: r.name,
        category: r.categoryId?.name ? { id: String(r.categoryId._id ?? r.categoryId), name: r.categoryId.name } : null,
        manager: r.managerId?.name ? { id: String(r.managerId._id), name: r.managerId.name } : null,
        isActive: r.isActive,
        status: r.status ?? "available",
      }))}
    />
  );
}
