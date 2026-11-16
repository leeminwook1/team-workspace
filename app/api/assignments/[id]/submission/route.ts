import { connectDB } from "@/lib/mongodb";
import { Assignment, Submission } from "@/models/Assignment";
import { requireActiveUser, json, badId } from "@/lib/api";
import { canSubmitAssignment, canManageAssignments } from "@/lib/permissions";
import { sanitizePhotos, removedPhotos, deletePhotos } from "@/lib/assignmentPhotos";
import { notify } from "@/lib/notify";
import { touchChanged } from "@/lib/changes";

// PUT /api/assignments/:id/submission — 내 제출물 저장(첫 제출·수정 겸용). body: { photos, note }
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  await connectDB();
  const a: any = await Assignment.findById(params.id).select("teamId title closed createdBy").lean();
  if (!a) return json({ error: "과제를 찾을 수 없습니다." }, 404);
  if (!canSubmitAssignment(user, String(a.teamId))) return json({ error: "이 과제에 제출할 권한이 없습니다." }, 403);
  if (a.closed) return json({ error: "마감된 과제라 제출·수정할 수 없어요." }, 409);

  const existing: any = await Submission.findOne({ assignmentId: a._id, userId: user.id });
  const before = (existing?.photos ?? []).map((p: any) => ({ pathname: p.pathname, caption: p.caption }));
  const photos = sanitizePhotos(body?.photos ?? [], user.id, before);
  if (!photos) return json({ error: "사진 정보가 올바르지 않습니다." }, 400);
  if (photos.length === 0) return json({ error: "사진을 1장 이상 올려주세요." }, 400);
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";

  const isFirst = !existing;
  if (existing) {
    existing.photos = photos;
    existing.note = note;
    await existing.save();
  } else {
    await Submission.create({ assignmentId: a._id, userId: user.id, photos, note });
  }
  await deletePhotos(removedPhotos(before, photos));
  await touchChanged("assignment");

  // 첫 제출 시 출제자에게 알림
  if (isFirst && String(a.createdBy) !== user.id) {
    await notify([String(a.createdBy)], {
      type: "assignment",
      title: "📸 과제가 제출됐어요",
      body: `${a.title} — ${user.name} 님 (${photos.length}장)`,
      link: `/assignments/${String(a._id)}`,
    });
  }
  return json({ saved: true, first: isFirst });
}

// DELETE /api/assignments/:id/submission?user=<id> — 제출 취소 (본인, 또는 팀장이 정리)
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const target = new URL(req.url).searchParams.get("user") || user.id;
  await connectDB();
  const a: any = await Assignment.findById(params.id).select("teamId closed").lean();
  if (!a) return json({ error: "과제를 찾을 수 없습니다." }, 404);
  const manage = canManageAssignments(user, String(a.teamId));
  if (target !== user.id && !manage) return json({ error: "권한이 없습니다." }, 403);
  if (a.closed && !manage) return json({ error: "마감된 과제라 취소할 수 없어요." }, 409);

  const s: any = await Submission.findOneAndDelete({ assignmentId: a._id, userId: target }).lean();
  if (!s) return json({ error: "제출물이 없습니다." }, 404);
  await deletePhotos((s.photos ?? []).map((p: any) => p.pathname));
  await touchChanged("assignment");
  return json({ deleted: true });
}
