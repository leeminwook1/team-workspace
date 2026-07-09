import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";

// GET /api/admin/users — 활성·비활성 전체 사용자 목록 (권한 관리 화면, Admin)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);

  await connectDB();
  const users = await User.find({ status: { $ne: "pending" } })
    .populate("teamId", "name color")
    .sort({ createdAt: 1 })
    .lean();

  return json({
    users: users.map((u: any) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role ?? "member",
      status: u.status,
      team: u.teamId
        ? { id: String(u.teamId._id ?? u.teamId), name: u.teamId.name ?? "(알 수 없음)", color: u.teamId.color ?? "#8b95a1" }
        : null,
    })),
  });
}
