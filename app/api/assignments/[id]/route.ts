import { connectDB } from "@/lib/mongodb";
import { Assignment, Submission } from "@/models/Assignment";
import { User } from "@/models/User";
import "@/models/Team";
import { requireActiveUser, json, badId } from "@/lib/api";
import { canManageAssignments, canViewAssignment, canSubmitAssignment } from "@/lib/permissions";
import { sanitizePhotos, removedPhotos, deletePhotos } from "@/lib/assignmentPhotos";
import { touchChanged } from "@/lib/changes";
import { logActivity } from "@/lib/activity";

// GET /api/assignments/:id — 과제 + 팀원 전체 제출물 (점검용) + 미제출자
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const a: any = await Assignment.findById(params.id).populate("teamId", "name color").populate("createdBy", "name").lean();
  if (!a) return json({ error: "과제를 찾을 수 없습니다." }, 404);
  const teamId = String(a.teamId?._id ?? a.teamId);
  if (!canViewAssignment(user, teamId)) return json({ error: "이 과제를 볼 권한이 없습니다." }, 403);

  const [subs, members] = await Promise.all([
    Submission.find({ assignmentId: a._id }).populate("userId", "name").populate("feedbackBy", "name").sort({ createdAt: 1 }).lean(),
    User.find({ teamId, status: "active" }).select("name role").sort({ name: 1 }).lean(),
  ]);
  const submittedIds = new Set(subs.map((s: any) => String(s.userId?._id ?? s.userId)));

  return json({
    assignment: {
      id: String(a._id),
      title: a.title,
      concept: a.concept,
      references: a.references ?? [],
      team: a.teamId ? { id: teamId, name: a.teamId.name, color: a.teamId.color } : null,
      createdBy: a.createdBy ? { id: String(a.createdBy._id), name: a.createdBy.name } : null,
      dueDate: a.dueDate,
      closed: a.closed,
      createdAt: a.createdAt,
    },
    submissions: subs.map((s: any) => ({
      id: String(s._id),
      user: s.userId ? { id: String(s.userId._id), name: s.userId.name } : null,
      photos: s.photos ?? [],
      note: s.note,
      feedback: s.feedback,
      feedbackBy: s.feedbackBy?.name ?? null,
      feedbackAt: s.feedbackAt,
      updatedAt: s.updatedAt,
    })),
    pending: members
      .filter((m: any) => !submittedIds.has(String(m._id)) && String(m._id) !== String(a.createdBy?._id))
      .map((m: any) => ({ id: String(m._id), name: m.name })),
    canManage: canManageAssignments(user, teamId),
    canSubmit: canSubmitAssignment(user, teamId),
  });
}

// PATCH /api/assignments/:id — 수정·마감/재개 (팀장·부팀장·admin)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "잘못된 요청입니다." }, 400);

  await connectDB();
  const a: any = await Assignment.findById(params.id);
  if (!a) return json({ error: "과제를 찾을 수 없습니다." }, 404);
  if (!canManageAssignments(user, String(a.teamId))) return json({ error: "과제를 수정할 권한이 없습니다." }, 403);

  let removed: string[] = [];
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t || t.length > 120) return json({ error: "제목을 입력하세요 (120자 이내)." }, 400);
    a.title = t;
  }
  if (typeof body.concept === "string") a.concept = body.concept.trim().slice(0, 3000);
  if (body.dueDate !== undefined) {
    const d = body.dueDate ? new Date(body.dueDate) : null;
    if (d && isNaN(d.getTime())) return json({ error: "마감일 형식이 잘못됐습니다." }, 400);
    // 마감일이 바뀌면 일주일 전 알림을 새 마감일 기준으로 다시 보낸다
    if (String(a.dueDate?.getTime?.() ?? "") !== String(d?.getTime() ?? "")) a.dueRemindedAt = null;
    a.dueDate = d;
  }
  if (typeof body.closed === "boolean") a.closed = body.closed;
  if (body.references !== undefined) {
    const before = (a.references ?? []).map((p: any) => ({ pathname: p.pathname, caption: p.caption }));
    const refs = sanitizePhotos(body.references, user.id, before);
    if (!refs) return json({ error: "레퍼런스 사진 정보가 올바르지 않습니다." }, 400);
    removed = removedPhotos(before, refs);
    a.references = refs;
  }

  await a.save();
  await deletePhotos(removed);
  await touchChanged("assignment");
  return json({ id: String(a._id) });
}

// DELETE /api/assignments/:id — 과제 삭제 (제출물·사진 포함)
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const a: any = await Assignment.findById(params.id).lean();
  if (!a) return json({ error: "과제를 찾을 수 없습니다." }, 404);
  if (!canManageAssignments(user, String(a.teamId))) return json({ error: "과제를 삭제할 권한이 없습니다." }, 403);

  const subs: any[] = await Submission.find({ assignmentId: a._id }).select("photos").lean();
  const paths = [
    ...(a.references ?? []).map((p: any) => p.pathname),
    ...subs.flatMap((s) => (s.photos ?? []).map((p: any) => p.pathname)),
  ];
  await Submission.deleteMany({ assignmentId: a._id });
  await Assignment.deleteOne({ _id: a._id });
  await deletePhotos(paths);
  await touchChanged("assignment");
  await logActivity({ actorId: user.id, actorName: user.name, action: "delete", targetType: "assignment", targetTitle: a.title });
  return json({ deleted: true });
}
