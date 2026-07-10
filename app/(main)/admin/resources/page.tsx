import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canManageTeams, type SessionUser } from "@/lib/permissions";
import { connectDB } from "@/lib/mongodb";
import { Resource } from "@/models/Resource";
import { ResourceCategory } from "@/models/ResourceCategory";
import { ensureResourceCategories } from "@/lib/resourceCategories";
import ResourceManager from "@/components/admin/ResourceManager";

export const dynamic = "force-dynamic";

export default async function AdminResourcesPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canManageTeams(session.user as SessionUser)) redirect("/calendar");

  await ensureResourceCategories();
  const [resources, categories] = await Promise.all([
    Resource.find().populate("categoryId", "name color").sort({ name: 1 }).lean(),
    ResourceCategory.find().sort({ order: 1, name: 1 }).lean(),
  ]);

  return (
    <ResourceManager
      initialCategories={categories.map((c: any) => ({ id: String(c._id), name: c.name, color: c.color || "#8b95a1", isActive: c.isActive }))}
      initialResources={resources.map((r: any) => ({
        id: String(r._id),
        name: r.name,
        category: r.categoryId?.name ? { id: String(r.categoryId._id ?? r.categoryId), name: r.categoryId.name } : null,
        isActive: r.isActive,
      }))}
    />
  );
}
