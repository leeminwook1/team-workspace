import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canManageTeams, type SessionUser } from "@/lib/permissions";
import { connectDB } from "@/lib/mongodb";
import { Category } from "@/models/Category";
import CategoryManager from "@/components/admin/CategoryManager";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canManageTeams(session.user as SessionUser)) redirect("/calendar");

  await connectDB();
  const cats = await Category.find().sort({ createdAt: 1 }).lean();

  return (
    <CategoryManager
      initial={cats.map((c: any) => ({ id: String(c._id), name: c.name, color: c.color, isActive: c.isActive }))}
    />
  );
}
