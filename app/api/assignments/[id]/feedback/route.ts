import { connectDB } from "@/lib/mongodb";
import { Assignment, Submission } from "@/models/Assignment";
import { requireActiveUser, json, badId } from "@/lib/api";
import { canManageAssignments } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { touchChanged } from "@/lib/changes";

// POST /api/assignments/:id/feedback — 팀장 피드백 작성·수정. body: { userId, feedback } (빈 문자열 = 삭제)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const targetId = typeof body?.userId === "string" ? body.userId : "";
  const text = typeof body?.feedback === "string" ? body.feedback.trim().slice(0, 2000) : "";
  if (!targetId) return json({ error: "대상을 지정해주세요." }, 400);

  await connectDB();
  const a: any = await Assignment.findById(params.id).select("teamId title").lean();
  if (!a) return json({ error: "과제를 찾을 수 없습니다." }, 404);
  if (!canManageAssignments(user, String(a.teamId))) return json({ error: "피드백 권한이 없습니다. (과장·부과장)" }, 403);

  const s: any = await Submission.findOne({ assignmentId: a._id, userId: targetId });
  if (!s) return json({ error: "제출물이 없습니다." }, 404);
  const hadFeedback = !!s.feedback;
  s.feedback = text;
  s.feedbackBy = text ? user.id : null;
  s.feedbackAt = text ? new Date() : null;
  await s.save();
  await touchChanged("assignment");

  if (text && !hadFeedback && targetId !== user.id) {
    await notify([targetId], {
      type: "assignment",
      title: "💬 과제에 피드백이 달렸어요",
      body: `${a.title} — ${text.length > 50 ? text.slice(0, 50) + "…" : text}`,
      link: `/assignments/${String(a._id)}`,
    });
  }
  return json({ saved: true });
}
