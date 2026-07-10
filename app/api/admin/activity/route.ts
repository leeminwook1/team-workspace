import { connectDB } from "@/lib/mongodb";
import { ActivityLog } from "@/models/ActivityLog";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";

// GET /api/admin/activity — 최근 활동 로그 (최고관리자 전용)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);

  await connectDB();
  const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(100).lean();

  return json({
    logs: logs.map((l: any) => ({
      id: String(l._id),
      actorName: l.actorName ?? "알 수 없음",
      action: l.action,
      targetTitle: l.targetTitle ?? "",
      meta: l.meta ?? {},
      createdAt: l.createdAt,
    })),
  });
}
