import { connectDB } from "@/lib/mongodb";
import { Directive } from "@/models/Directive";
import { requireActiveUser, json } from "@/lib/api";
import { canManageDirective, canEditDirective } from "@/lib/permissions";
import { directiveUpdateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";

const MANAGE_KEYS = ["status", "assignments"]; // 팀장 권한
const EDIT_KEYS = ["title", "body", "dueDate", "priority"]; // 발신자 권한

// PATCH /api/directives/:id — 상태·팀원 재분배(팀장) / 본문 수정(발신자·admin)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = directiveUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const dir: any = await Directive.findById(params.id);
  if (!dir) return json({ error: "지시를 찾을 수 없습니다." }, 404);

  const d = parsed.data;
  const keys = Object.keys(d);
  const teamId = String(dir.teamId);
  const needsManage = keys.some((k) => MANAGE_KEYS.includes(k));
  const needsEdit = keys.some((k) => EDIT_KEYS.includes(k));

  if (needsManage && !canManageDirective(user, teamId)) {
    return json({ error: "상태 변경·재분배는 담당 팀장만 가능합니다." }, 403);
  }
  if (needsEdit && !canEditDirective(user, String(dir.createdBy))) {
    return json({ error: "지시 내용 수정은 발신자만 가능합니다." }, 403);
  }

  if (d.title !== undefined) dir.title = d.title;
  if (d.body !== undefined) dir.body = d.body;
  if (d.priority !== undefined) dir.priority = d.priority;
  if (d.dueDate !== undefined) dir.dueDate = d.dueDate ? new Date(d.dueDate) : null;
  if (d.status !== undefined) {
    // 완료 시각 기록 — 처리 소요 리포트용 (완료에서 벗어나면 초기화)
    if (d.status === "done" && dir.status !== "done") dir.doneAt = new Date();
    else if (d.status !== "done") dir.doneAt = null;
    dir.status = d.status;
  }
  if (d.assignments !== undefined) {
    // 재분배 갱신: 기존 taskId(일정 연결)는 동일 사용자 항목이면 유지
    const prevByUser = new Map<string, any>();
    (dir.assignments ?? []).forEach((a: any) => prevByUser.set(String(a.userId), a));
    dir.assignments = d.assignments.map((a) => {
      const prev = prevByUser.get(String(a.userId));
      return { userId: a.userId, note: a.note ?? "", done: !!a.done, taskId: prev?.taskId ?? null };
    });
  }

  await dir.save();
  return json({ id: String(dir._id) });
}

// DELETE /api/directives/:id — 발신자 본인 또는 admin
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const dir: any = await Directive.findById(params.id).lean();
  if (!dir) return json({ error: "지시를 찾을 수 없습니다." }, 404);
  if (!canEditDirective(user, String(dir.createdBy))) {
    return json({ error: "지시 삭제는 발신자 또는 최고관리자만 가능합니다." }, 403);
  }

  await Directive.deleteOne({ _id: params.id });
  await logActivity({ actorId: user.id, actorName: user.name, action: "delete", targetType: "directive", targetTitle: dir.title });
  return json({ deleted: true });
}
