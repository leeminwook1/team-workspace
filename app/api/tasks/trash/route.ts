import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { visibleTeamIds } from "@/lib/permissions";

// GET /api/tasks/trash — 최근 30일 내 삭제된 업무 (조회 범위는 역할에 따름)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const q: any = { deletedAt: { $ne: null, $gte: new Date(Date.now() - 30 * 86_400_000) } };
  const scope = visibleTeamIds(user);
  if (scope !== "all") {
    if (scope.length === 0) return json({ tasks: [] });
    q.teamIds = { $in: scope };
  }

  const rows: any[] = await Task.find(q)
    .populate("teamIds", "name color")
    .sort({ deletedAt: -1 })
    .limit(100)
    .lean();

  return json({
    tasks: rows.map((t) => ({
      id: String(t._id),
      title: t.title,
      teams: (t.teamIds ?? []).map((tm: any) => ({ name: tm.name, color: tm.color })),
      startDate: t.startDate,
      endDate: t.endDate,
      allDay: t.allDay,
      deletedAt: t.deletedAt,
      recurrenceId: t.recurrenceId ? String(t.recurrenceId) : null,
    })),
  });
}
