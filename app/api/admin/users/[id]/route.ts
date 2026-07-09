import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canApproveUsers } from "@/lib/permissions";

// DELETE /api/admin/users/:id — 가입 신청 거절 (pending만 삭제 가능)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canApproveUsers(user)) return json({ error: "권한이 없습니다." }, 403);

  await connectDB();
  const target: any = await User.findById(params.id).lean();
  if (!target) return json({ error: "사용자를 찾을 수 없습니다." }, 404);
  if (target.status !== "pending") {
    return json({ error: "승인 대기 사용자만 거절(삭제)할 수 있습니다." }, 400);
  }

  await User.deleteOne({ _id: params.id });
  return json({ rejected: true });
}
