import { connectDB } from "@/lib/mongodb";
import { Assignment, Submission } from "@/models/Assignment";
import { User } from "@/models/User";
import { Team } from "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { canManageAssignments, visibleTeamIds } from "@/lib/permissions";
import { sanitizePhotos } from "@/lib/assignmentPhotos";
import { notify } from "@/lib/notify";
import { touchChanged } from "@/lib/changes";
import { logActivity } from "@/lib/activity";

// GET /api/assignments?status=open|closed — 볼 수 있는 팀의 과제 목록 + 제출 현황
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const status = new URL(req.url).searchParams.get("status") === "closed" ? "closed" : "open";
  await connectDB();

  const q: any = { closed: status === "closed" };
  const scope = visibleTeamIds(user);
  if (scope !== "all") {
    if (scope.length === 0) return json({ assignments: [] });
    q.teamId = { $in: scope };
  }
  const list: any[] = await Assignment.find(q)
    .populate("teamId", "name color")
    .populate("createdBy", "name teamId")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const ids = list.map((a) => a._id);
  const teamOids = Array.from(new Map(list.filter((a) => a.teamId?._id).map((a) => [String(a.teamId._id), a.teamId._id])).values());
  const [counts, mine, members] = await Promise.all([
    Submission.aggregate([{ $match: { assignmentId: { $in: ids } } }, { $group: { _id: "$assignmentId", n: { $sum: 1 } } }]),
    Submission.find({ assignmentId: { $in: ids }, userId: user.id }).select("assignmentId").lean(),
    User.aggregate([{ $match: { status: "active", teamId: { $in: teamOids } } }, { $group: { _id: "$teamId", n: { $sum: 1 } } }]),
  ]);
  const countBy = new Map(counts.map((c: any) => [String(c._id), c.n]));
  const mineSet = new Set(mine.map((m: any) => String(m.assignmentId)));
  const memberBy = new Map(members.map((m: any) => [String(m._id), m.n]));

  return json({
    assignments: list.map((a) => ({
      id: String(a._id),
      title: a.title,
      concept: a.concept,
      cover: a.references?.[0]?.pathname ?? null,
      refCount: a.references?.length ?? 0,
      team: a.teamId ? { id: String(a.teamId._id), name: a.teamId.name, color: a.teamId.color } : null,
      createdBy: a.createdBy?.name ?? "",
      dueDate: a.dueDate,
      closed: a.closed,
      createdAt: a.createdAt,
      submitted: countBy.get(String(a._id)) ?? 0,
      // 제출 대상 인원 — 팀 인원에서 출제자(같은 팀일 때) 제외
      expected: Math.max(0, (memberBy.get(String(a.teamId?._id)) ?? 0)
        - (a.createdBy?.teamId && String(a.createdBy.teamId) === String(a.teamId?._id) ? 1 : 0)),
      mySubmitted: mineSet.has(String(a._id)),
    })),
  });
}

// POST /api/assignments — 과제 출제 (팀장·부팀장·admin)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const concept = typeof body?.concept === "string" ? body.concept.trim().slice(0, 3000) : "";
  const teamId = typeof body?.teamId === "string" && body.teamId ? body.teamId : user.teamId;
  if (!title || title.length > 120) return json({ error: "제목을 입력하세요 (120자 이내)." }, 400);
  if (!teamId) return json({ error: "팀을 선택하세요." }, 400);
  if (!canManageAssignments(user, teamId)) return json({ error: "이 팀에 과제를 낼 권한이 없습니다. (팀장·부팀장)" }, 403);

  const references = sanitizePhotos(body?.references ?? [], user.id);
  if (!references) return json({ error: "레퍼런스 사진 정보가 올바르지 않습니다." }, 400);
  let dueDate: Date | null = null;
  if (body?.dueDate) {
    dueDate = new Date(body.dueDate);
    if (isNaN(dueDate.getTime())) return json({ error: "마감일 형식이 잘못됐습니다." }, 400);
  }

  await connectDB();
  const team: any = await Team.findOne({ _id: teamId, isActive: true }).select("name").lean().catch(() => null);
  if (!team) return json({ error: "팀을 찾을 수 없습니다." }, 404);

  const a = await Assignment.create({ title, concept, references, teamId, createdBy: user.id, dueDate });
  await touchChanged("assignment");
  await logActivity({ actorId: user.id, actorName: user.name, action: "create", targetType: "assignment", targetTitle: title });

  // 팀원에게 새 과제 알림 (출제자 제외)
  const members: any[] = await User.find({ teamId, status: "active", _id: { $ne: user.id } }).select("_id").lean();
  const due = dueDate ? ` · 마감 ${dueDate.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" })}` : "";
  await notify(members.map((m) => String(m._id)), {
    type: "assignment",
    title: "📸 새 촬영 과제가 나왔어요",
    body: `${title}${due}`,
    link: `/assignments/${String(a._id)}`,
  });

  return json({ id: String(a._id) }, 201);
}
