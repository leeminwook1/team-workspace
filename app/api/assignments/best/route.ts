import { connectDB } from "@/lib/mongodb";
import { Assignment, Submission } from "@/models/Assignment";
import "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { visibleTeamIds } from "@/lib/permissions";

// GET /api/assignments/best — 베스트 컷 아카이브 (최근 순, 과제 정보 포함)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const aq: any = {};
  const scope = visibleTeamIds(user);
  if (scope !== "all") {
    if (scope.length === 0) return json({ photos: [] });
    aq.teamId = { $in: scope };
  }
  const assignments: any[] = await Assignment.find(aq).select("title createdAt").lean();
  const byId = new Map(assignments.map((a) => [String(a._id), a]));
  const subs: any[] = await Submission.find({ assignmentId: { $in: assignments.map((a) => a._id) }, "photos.best": true })
    .populate("userId", "name").sort({ updatedAt: -1 }).limit(200).lean();

  const photos = subs.flatMap((s) =>
    (s.photos ?? []).filter((p: any) => p.best).map((p: any) => ({
      pathname: p.pathname,
      caption: p.caption ?? "",
      who: s.userId?.name ?? "?",
      assignmentId: String(s.assignmentId),
      assignmentTitle: byId.get(String(s.assignmentId))?.title ?? "",
    }))
  );
  return json({ photos });
}
