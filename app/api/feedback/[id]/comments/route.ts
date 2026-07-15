import { connectDB } from "@/lib/mongodb";
import { Feedback } from "@/models/Feedback";
import { requireActiveUser, json, limitWrites } from "@/lib/api";
import { canManageFeedback } from "@/lib/permissions";
import { feedbackCommentSchema } from "@/lib/validations";
import { touchChanged } from "@/lib/changes";
import { notify } from "@/lib/notify";

// POST /api/feedback/:id/comments — 댓글 달기 (모든 활성 사용자)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const limited = await limitWrites(`fbcomment:${user.id}`, 20, 10 * 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = feedbackCommentSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const fb: any = await Feedback.findById(params.id);
  if (!fb) return json({ error: "피드백을 찾을 수 없습니다." }, 404);

  fb.comments.push({ userId: user.id, body: parsed.data.body });
  await fb.save();
  await touchChanged("feedback");

  // 피드백 작성자에게 알림 (본인 댓글 제외)
  if (String(fb.createdBy) !== user.id) {
    await notify([String(fb.createdBy)], {
      type: "feedback",
      title: "내 피드백에 댓글이 달렸어요",
      body: `${fb.title} — ${parsed.data.body.slice(0, 80)}`,
      link: "/feedback",
    });
  }

  return json({ id: String(fb.comments[fb.comments.length - 1]._id) }, 201);
}

// DELETE /api/feedback/:id/comments — 댓글 삭제 (댓글 작성자 또는 admin). body: { commentId }
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const commentId = typeof body?.commentId === "string" ? body.commentId : "";
  if (!commentId) return json({ error: "commentId가 필요합니다." }, 400);

  await connectDB();
  const fb: any = await Feedback.findById(params.id);
  if (!fb) return json({ error: "피드백을 찾을 수 없습니다." }, 404);

  const comment = fb.comments.id(commentId);
  if (!comment) return json({ error: "댓글을 찾을 수 없습니다." }, 404);
  if (String(comment.userId) !== user.id && !canManageFeedback(user)) {
    return json({ error: "댓글 삭제는 작성자만 가능합니다." }, 403);
  }

  comment.deleteOne();
  await fb.save();
  await touchChanged("feedback");
  return json({ deleted: true });
}
