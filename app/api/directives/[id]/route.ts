import { connectDB } from "@/lib/mongodb";
import { Directive } from "@/models/Directive";
import { requireActiveUser, json, badId } from "@/lib/api";
import { canManageDirective, canEditDirective } from "@/lib/permissions";
import { directiveUpdateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { touchChanged } from "@/lib/changes";
import { filterValidAssignees } from "@/lib/assignees";
import { notify } from "@/lib/notify";

const MANAGE_KEYS = ["status", "assignments"]; // 팀장 권한
const EDIT_KEYS = ["title", "body", "dueDate", "priority"]; // 발신자 권한

// PATCH /api/directives/:id — 상태·과원 재배분(과장) / 본문 수정(발신자·admin) / 내 몫 완료(받은 과원)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = directiveUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const dir: any = await Directive.findById(params.id);
  if (!dir) return json({ error: "TODO를 찾을 수 없습니다." }, 404);

  const d = parsed.data;

  // 받은 과원 — 내 몫 완료 체크 (다른 필드와 섞지 않는다)
  if (d.myDone !== undefined) {
    const mine = (dir.assignments ?? []).find((a: any) => String(a.userId) === user.id);
    if (!mine) return json({ error: "내가 받은 TODO가 아니에요." }, 403);
    if (!!mine.done === d.myDone) return json({ id: String(dir._id) });
    mine.done = d.myDone;
    mine.doneAt = d.myDone ? new Date() : null;
    if (!mine.readAt) mine.readAt = new Date();
    // 전체 상태 자동 반영 — 모두 완료면 완료, 한 명이라도 하면 진행중, 완료를 풀면 진행중으로
    const all = dir.assignments as any[];
    if (all.length > 0 && all.every((a) => a.done)) {
      if (dir.status !== "done") { dir.status = "done"; dir.doneAt = new Date(); }
    } else if (dir.status === "done" || (dir.status === "todo" && all.some((a) => a.done))) {
      dir.status = "in_progress"; dir.doneAt = null;
    }
    await dir.save();
    await touchChanged("directive");
    if (d.myDone && String(dir.createdBy) !== user.id) {
      const left = all.filter((a) => !a.done).length;
      await notify([String(dir.createdBy)], {
        type: "directive",
        title: left === 0 ? `🎉 TODO 모두 완료 — ${dir.title}` : `✅ ${user.name}님이 TODO를 완료했어요`,
        body: left === 0 ? `받은 ${all.length}명 모두 완료했어요` : `${dir.title} · 남은 사람 ${left}명`,
        link: `/directives?q=${encodeURIComponent(dir.title)}`,
      });
    }
    return json({ id: String(dir._id) });
  }

  const keys = Object.keys(d);
  const teamId = String(dir.teamId);
  const needsManage = keys.some((k) => MANAGE_KEYS.includes(k));
  const needsEdit = keys.some((k) => EDIT_KEYS.includes(k));

  if (needsManage && !canManageDirective(user, teamId)) {
    return json({ error: "상태 변경·배분은 과장만 할 수 있어요." }, 403);
  }
  if (needsEdit && !canEditDirective(user, String(dir.createdBy))) {
    return json({ error: "TODO 내용 수정은 발신자만 가능합니다." }, 403);
  }

  let added: string[] = [];
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
    // 분배 대상은 이 팀의 활성 소속자만 — 임의·타 팀 userId 주입 차단 (변환 시 알림도 이들에게만)
    const validIds = new Set(await filterValidAssignees(d.assignments.map((a) => a.userId), [teamId]));
    // 재분배 갱신: 기존 taskId(일정 연결)는 동일 사용자 항목이면 유지
    const prevByUser = new Map<string, any>();
    (dir.assignments ?? []).forEach((a: any) => prevByUser.set(String(a.userId), a));
    dir.assignments = d.assignments
      .filter((a) => validIds.has(String(a.userId)))
      .map((a) => {
        const prev = prevByUser.get(String(a.userId));
        // 완료·읽음 기록은 과원이 남긴 것이라 그대로 유지
        return {
          userId: a.userId, note: a.note ?? "",
          done: prev ? !!prev.done : false, doneAt: prev?.doneAt ?? null, readAt: prev?.readAt ?? null,
          taskId: prev?.taskId ?? null,
        };
      });
    // 새로 추가된 과원에게 알림
    added = dir.assignments.map((a: any) => String(a.userId)).filter((id: string) => !prevByUser.has(id) && id !== user.id);
  }

  await dir.save();
  await touchChanged("directive"); // 상태·분배 변경은 로그를 안 남기므로 직접 신호
  if (added.length) {
    await notify(added, {
      type: "directive",
      title: `📝 새 TODO — ${dir.title}`,
      body: `${user.name ?? "과장"}님이 보냈어요`,
      link: `/directives?q=${encodeURIComponent(dir.title)}`,
    });
  }
  return json({ id: String(dir._id) });
}

// DELETE /api/directives/:id — 발신자 본인 또는 admin
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const dir: any = await Directive.findById(params.id).lean();
  if (!dir) return json({ error: "TODO를 찾을 수 없습니다." }, 404);
  if (!canEditDirective(user, String(dir.createdBy))) {
    return json({ error: "TODO 삭제는 발신자 또는 시스템 관리자만 가능합니다." }, 403);
  }

  await Directive.deleteOne({ _id: params.id });
  await logActivity({ actorId: user.id, actorName: user.name, action: "delete", targetType: "directive", targetTitle: dir.title });
  return json({ deleted: true });
}
