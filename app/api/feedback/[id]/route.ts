import { connectDB } from "@/lib/mongodb";
import { Feedback } from "@/models/Feedback";
import { requireActiveUser, json } from "@/lib/api";
import { canManageFeedback, canEditFeedback } from "@/lib/permissions";
import { feedbackUpdateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { touchChanged } from "@/lib/changes";
import { notify } from "@/lib/notify";

const STATUS_LABEL: Record<string, string> = {
  open: "접수", in_progress: "진행중", done: "반영 완료", declined: "반려",
};

// PATCH /api/feedback/:id — 공감(전체) / 본문 수정(작성자·admin) / 상태 변경(admin)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = feedbackUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const fb: any = await Feedback.findById(params.id);
  if (!fb) return json({ error: "피드백을 찾을 수 없습니다." }, 404);

  const d = parsed.data;
  const editKeys = ["type", "title", "body"] as const;
  if (editKeys.some((k) => d[k] !== undefined) && !canEditFeedback(user, String(fb.createdBy))) {
    return json({ error: "내용 수정은 작성자만 가능합니다." }, 403);
  }
  if (d.status !== undefined && !canManageFeedback(user)) {
    return json({ error: "상태 변경은 최고관리자만 가능합니다." }, 403);
  }

  if (d.vote !== undefined) {
    // 공감 토글 — 누구나
    if (d.vote) fb.votes.addToSet(user.id);
    else fb.votes.pull(user.id);
  }
  if (d.type !== undefined) fb.type = d.type;
  if (d.title !== undefined) fb.title = d.title;
  if (d.body !== undefined) fb.body = d.body;

  const statusChanged = d.status !== undefined && d.status !== fb.status;
  if (d.status !== undefined) fb.status = d.status;

  await fb.save();
  await touchChanged("feedback");

  // 상태가 바뀌면 작성자에게 알림 (본인 변경 제외)
  if (statusChanged && String(fb.createdBy) !== user.id) {
    await notify([String(fb.createdBy)], {
      type: "feedback",
      title: `내 피드백이 [${STATUS_LABEL[fb.status] ?? fb.status}] 상태가 됐어요`,
      body: fb.title,
      link: "/feedback",
    });
  }

  return json({ id: String(fb._id) });
}

// DELETE /api/feedback/:id — 작성자 또는 admin
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const fb: any = await Feedback.findById(params.id).lean();
  if (!fb) return json({ error: "피드백을 찾을 수 없습니다." }, 404);
  if (!canEditFeedback(user, String(fb.createdBy))) {
    return json({ error: "피드백 삭제는 작성자 또는 최고관리자만 가능합니다." }, 403);
  }

  await Feedback.deleteOne({ _id: params.id });
  await logActivity({ actorId: user.id, actorName: user.name, action: "delete", targetTitle: `피드백: ${fb.title}` });
  await touchChanged("feedback");
  return json({ deleted: true });
}
