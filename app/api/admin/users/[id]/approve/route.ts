import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canApproveUsers } from "@/lib/permissions";
import { approveSchema } from "@/lib/validations";

// POST /api/admin/users/:id/approve — 승인 + 팀·역할 배정 (설계 5.3)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canApproveUsers(user)) return json({ error: "승인 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const target: any = await User.findById(params.id);
  if (!target) return json({ error: "사용자를 찾을 수 없습니다." }, 404);
  if (target.status !== "pending") return json({ error: "승인 대기 상태가 아닙니다." }, 400);

  // orgRole 부여는 Admin만 가능 (과장·부과장은 팀 배정만)
  if (parsed.data.orgRole && user.orgRole !== "admin") {
    return json({ error: "전사 역할 부여는 최고관리자만 가능합니다." }, 403);
  }

  target.teams = parsed.data.teams;
  if (parsed.data.orgRole !== undefined) target.orgRole = parsed.data.orgRole ?? undefined;
  target.status = "active";
  await target.save();

  return json({ approved: true });
}
