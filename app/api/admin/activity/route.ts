import { connectDB } from "@/lib/mongodb";
import { ActivityLog } from "@/models/ActivityLog";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";

// GET /api/admin/activity?type=activity|login — 최근 로그 (최고관리자 전용)
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);

  const type = new URL(req.url).searchParams.get("type");
  // 로그인 탭 = auth, 활동 탭 = 그 외(업무·TODO)
  const q = type === "login" ? { targetType: "auth" } : { targetType: { $ne: "auth" } };

  await connectDB();
  const logs = await ActivityLog.find(q).sort({ createdAt: -1 }).limit(100).lean();

  return json({
    logs: logs.map((l: any) => ({
      id: String(l._id),
      actorName: l.actorName ?? "알 수 없음",
      action: l.action,
      targetType: l.targetType ?? "task",
      targetTitle: l.targetTitle ?? "",
      meta: l.meta ?? {},
      createdAt: l.createdAt,
    })),
  });
}
