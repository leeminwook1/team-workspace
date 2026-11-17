import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { canManageTeams, type SessionUser } from "@/lib/permissions";
import { connectDB } from "@/lib/mongodb";
import { Team } from "@/models/Team";
import { getDeptId } from "@/lib/dept";
import DeptSettings from "@/components/admin/DeptSettings";

export const dynamic = "force-dynamic";

// 과 설정 — 사진과 전용이라 팀 목록 대신 과 하나만 편집
export default async function AdminDeptPage() {
  const session = await getServerSession(authOptions);
  if (!session || !canManageTeams(session.user as SessionUser)) redirect("/calendar");

  await connectDB();
  const id = await getDeptId();
  const t: any = id ? await Team.findById(id).lean() : null;
  if (!t) return <p className="muted-note">과 정보가 없습니다.</p>;

  return (
    <DeptSettings
      dept={{ id: String(t._id), name: t.name, slug: t.slug, color: t.color, telegramChatId: t.telegramChatId ?? "" }}
    />
  );
}
