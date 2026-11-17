import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import "@/models/User";
import "@/models/Category";
import { requireActiveUser, json } from "@/lib/api";
import { visibleTeamIds, canEditTaskDoc, canChangeStatusAny } from "@/lib/permissions";
import { serializePipeline, nextStep } from "@/lib/pipeline";

// GET /api/pipeline — 촬영 진행 보드. 진행 중 전부 + 보고 끝난 것은 최근 14일분
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const q: any = {
    "pipeline.on": true,
    $or: [{ "pipeline.steps.report": null }, { "pipeline.steps.report": { $gte: new Date(Date.now() - 14 * 86_400_000) } }],
  };
  const scope = visibleTeamIds(user);
  if (scope !== "all") {
    if (scope.length === 0) return json({ items: [] });
    q.teamIds = { $in: scope };
  }
  const list: any[] = await Task.find(q)
    .populate("assignees", "name")
    .populate("categoryId", "name color")
    .sort({ startDate: 1 })
    .limit(300)
    .lean();

  return json({
    items: list.map((t) => {
      const teamIds = (t.teamIds ?? []).map(String);
      const assigneeIds = (t.assignees ?? []).map((a: any) => String(a._id ?? a));
      const pipeline = serializePipeline(t.pipeline)!;
      return {
        id: String(t._id),
        title: t.title,
        startDate: t.startDate,
        endDate: t.endDate,
        allDay: t.allDay,
        location: t.location ?? "",
        category: t.categoryId ? { name: t.categoryId.name, color: t.categoryId.color } : null,
        assignees: (t.assignees ?? []).map((a: any) => ({ id: String(a._id), name: a.name })),
        pipeline,
        next: nextStep(pipeline),
        canStep: canEditTaskDoc(user, teamIds, t.createdBy ? String(t.createdBy) : null) || canChangeStatusAny(user, teamIds, assigneeIds),
      };
    }),
  });
}
