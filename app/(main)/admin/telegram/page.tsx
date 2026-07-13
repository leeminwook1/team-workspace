import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canManageTeams, type SessionUser } from "@/lib/permissions";
import TelegramManager from "@/components/admin/TelegramManager";

export const dynamic = "force-dynamic";

// 텔레그램 연동 현황 — Admin
export default async function AdminTelegramPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!canManageTeams(session.user as SessionUser)) redirect("/admin");

  return <TelegramManager />;
}
