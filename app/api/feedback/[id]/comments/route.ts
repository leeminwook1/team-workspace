import mongoose from "mongoose";
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
  // 전체 댓글을 읽지 않고 알림에 필요한 필드만 — 목록/문서 비대화 방지
  const fb: any = await Feedback.findById(params.id).select("title createdBy").lean();
  if (!fb) return json({ error: "피드백을 찾을 수 없습니다." }, 404);

  // 원자적 추가 + 최근 100개로 상한 — push+save 레이스로 인한 유실·무제한 증가 방지
  const cid = new mongoose.Types.ObjectId();
  await Feedback.updateOne(
    { _id: params.id },
    { $push: { comments: { $each: [{ _id: cid, userId: user.id, body: parsed.data.body, createdAt: new Date() }], $slice: -100 } } }
  );
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

  return json({ id: String(cid) }, 201);
}

// DELETE /api/feedback/:id/comments — 댓글 삭제 (댓글 작성자 또는 admin). body: { commentId }
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const commentId = typeof body?.commentId === "string" ? body.commentId : "";
  if (!commentId) return json({ error: "commentId가 필요합니다." }, 400);

  await connectDB();
  const fb: any = await Feedback.findById(params.id).select("comments._id comments.userId").lean();
  if (!fb) return json({ error: "피드백을 찾을 수 없습니다." }, 404);

  const comment = (fb.comments ?? []).find((c: any) => String(c._id) === commentId);
  if (!comment) return json({ error: "댓글을 찾을 수 없습니다." }, 404);
  if (String(comment.userId) !== user.id && !canManageFeedback(user)) {
    return json({ error: "댓글 삭제는 작성자만 가능합니다." }, 403);
  }

  // 원자적 삭제 — 동시 수정과 경합하지 않게 $pull
  await Feedback.updateOne({ _id: params.id }, { $pull: { comments: { _id: commentId } } });
  await touchChanged("feedback");
  return json({ deleted: true });
}
