import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canManageTeams, type SessionUser } from "@/lib/permissions";
import { connectDB } from "@/lib/mongodb";
import { Resource } from "@/models/Resource";
import ResourceManager from "@/components/admin/ResourceManager";

export const dynamic = "force-dynamic";

export default async function AdminResourcesPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canManageTeams(session.user as SessionUser)) redirect("/calendar");

  await connectDB();
  const resources = await Resource.find().sort({ category: 1, name: 1 }).lean();

  return (
    <ResourceManager
      initialResources={resources.map((r: any) => ({
        id: String(r._id),
        name: r.name,
        category: r.category,
        isActive: r.isActive,
      }))}
    />
  );
}
