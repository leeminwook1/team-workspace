import { connectDB } from "@/lib/mongodb";
import { ActivityLog } from "@/models/ActivityLog";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";

// GET /api/admin/activity?type=activity|login — 최근 로그 (최고관리자 전용)
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = 20;
  // 로그인 탭 = auth, 활동 탭 = 그 외(업무·TODO)
  const q = type === "login" ? { targetType: "auth" } : { targetType: { $ne: "auth" } };

  await connectDB();
  const [total, logs] = await Promise.all([
    ActivityLog.countDocuments(q),
    ActivityLog.find(q).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
  ]);

  return json({
    total,
    page,
    pageSize,
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
