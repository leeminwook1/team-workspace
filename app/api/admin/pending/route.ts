import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canApproveUsers } from "@/lib/permissions";

// GET /api/admin/pending — 가입 승인 대기열 (Admin·과장·부과장, 설계 확정)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canApproveUsers(user)) return json({ error: "승인 권한이 없습니다." }, 403);

  await connectDB();
  const pending = await User.find({ status: "pending" })
    .select("name email createdAt role teamId")
    .sort({ createdAt: 1 })
    .lean();

  return json({
    users: pending.map((u: any) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      requestedAt: u.createdAt,
      // 신청자가 희망한 역할·팀 — 승인 화면에 미리 선택된다
      role: u.role ?? "member",
      teamId: u.teamId ? String(u.teamId) : null,
    })),
  });
}
