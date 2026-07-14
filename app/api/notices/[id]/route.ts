import { connectDB } from "@/lib/mongodb";
import { Notice } from "@/models/Notice";
import { requireActiveUser, json } from "@/lib/api";
import { canEditNotice } from "@/lib/permissions";
import { noticeUpdateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { touchChanged } from "@/lib/changes";

// PATCH /api/notices/:id — 제목·본문·고정 수정 (작성자 또는 admin)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = noticeUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const notice: any = await Notice.findById(params.id);
  if (!notice) return json({ error: "공지를 찾을 수 없습니다." }, 404);
  if (!canEditNotice(user, String(notice.createdBy))) {
    return json({ error: "공지 수정은 작성자 또는 최고관리자만 가능합니다." }, 403);
  }

  const d = parsed.data;
  if (d.title !== undefined) notice.title = d.title;
  if (d.body !== undefined) notice.body = d.body;
  if (d.pinned !== undefined) notice.pinned = d.pinned;
  await notice.save();
  await touchChanged("notice");
  return json({ id: String(notice._id) });
}

// DELETE /api/notices/:id — 작성자 또는 admin
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const notice: any = await Notice.findById(params.id).lean();
  if (!notice) return json({ error: "공지를 찾을 수 없습니다." }, 404);
  if (!canEditNotice(user, String(notice.createdBy))) {
    return json({ error: "공지 삭제는 작성자 또는 최고관리자만 가능합니다." }, 403);
  }

  await Notice.deleteOne({ _id: params.id });
  await logActivity({ actorId: user.id, actorName: user.name, action: "delete", targetTitle: `공지: ${notice.title}` });
  await touchChanged("notice");
  return json({ deleted: true });
}
