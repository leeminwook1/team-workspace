import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import "@/models/Team";
import type { SessionUser } from "@/lib/permissions";
import PersonalCalendar from "@/components/personal/PersonalCalendar";

export const dynamic = "force-dynamic";

// 내 캘린더 — 개인 일정. 같은 팀 팀장·admin만 팀원 캘린더 열람(읽기 전용) 가능.
export default async function PersonalPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = session.user as SessionUser & { name: string };

  await connectDB();

  // 열람 가능한 다른 사람 목록 — 팀장: 같은 팀원 / admin: 전체 활성 사용자
  let viewables: { id: string; name: string; teamName: string }[] = [];
  if (user.role === "leader" && user.teamId) {
    const members: any[] = await User.find({ teamId: user.teamId, status: "active", _id: { $ne: user.id } })
      .select("name").sort({ name: 1 }).lean();
    viewables = members.map((m) => ({ id: String(m._id), name: m.name, teamName: "" }));
  } else if (user.role === "admin") {
    const members: any[] = await User.find({ status: "active", _id: { $ne: user.id } })
      .populate("teamId", "name").select("name teamId").sort({ name: 1 }).lean();
    viewables = members.map((m) => ({ id: String(m._id), name: m.name, teamName: m.teamId?.name ?? "" }));
  }

  return <PersonalCalendar meName={user.name} viewables={viewables} />;
}
