import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import "@/models/Team";
import "@/models/User";
import "@/models/Category";
import { requireActiveUser, json } from "@/lib/api";
import { canEditTaskDoc, canDeleteTaskDoc, canChangeStatusAny, canCreateTaskInAll, visibleTeamIds } from "@/lib/permissions";
import { taskUpdateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { Reservation } from "@/models/Reservation";
import { taskWindow, findConflicts, conflictMessage, syncTaskReservations, cancelTaskReservations, findUnavailableResources, unavailableMessage } from "@/lib/taskReservations";

// 변경 알림 본문용 KST 포맷
const fmtDateTime = (dt: Date | string) =>
  new Date(dt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtTime = (dt: Date | string) =>
  new Date(dt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDay = (dt: Date | string) =>
  new Date(dt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });

// GET /api/tasks/:id — 단건 조회 (검색 딥링크용). 조회 범위(역할) 검증.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const t: any = await Task.findById(params.id)
    .populate("teamIds", "name color")
    .populate("categoryId", "name color")
    .populate("assignees", "name")
    .populate("createdBy", "name")
    .lean();
  if (!t) return json({ error: "업무를 찾을 수 없습니다." }, 404);

  const scope = visibleTeamIds(user);
  if (scope !== "all") {
    const ids = (t.teamIds ?? []).map((x: any) => String(x._id ?? x));
    if (!ids.some((id: string) => scope.includes(id))) return json({ error: "조회 권한이 없습니다." }, 403);
  }

  const linked: any[] = await Reservation.find({ relatedTaskId: t._id, status: "booked" })
    .populate("resourceId", "name").populate("reservedBy", "name").select("resourceId reservedBy").lean();

  return json({
    task: {
      resources: linked.filter((r) => r.resourceId).map((r) => ({
        id: String(r.resourceId._id),
        name: r.resourceId.name,
        ownerId: r.reservedBy ? String(r.reservedBy._id ?? r.reservedBy) : undefined,
        ownerName: r.reservedBy?.name ?? undefined,
      })),
      id: String(t._id),
      title: t.title,
      description: t.description,
      teams: (t.teamIds ?? []).filter(Boolean).map((tm: any) => ({ id: String(tm._id ?? tm), name: tm.name ?? "", color: tm.color ?? "#8b95a1" })),
      category: t.categoryId ? { id: String(t.categoryId._id ?? t.categoryId), name: t.categoryId.name ?? "", color: t.categoryId.color ?? "#8b95a1" } : null,
      assignees: (t.assignees ?? []).map((a: any) => ({ id: String(a._id ?? a), name: a.name ?? "" })),
      createdBy: t.createdBy?.name ? { id: String(t.createdBy._id ?? t.createdBy), name: t.createdBy.name } : null,
      startDate: t.startDate,
      endDate: t.endDate,
      allDay: t.allDay,
      status: t.status,
      priority: t.priority,
      location: t.location,
      recurrenceId: t.recurrenceId ? String(t.recurrenceId) : null,
      // 반복 시리즈 전체 회차 수 — 전체 삭제 확인 문구용
      seriesCount: t.recurrenceId ? await Task.countDocuments({ recurrenceId: t.recurrenceId }) : 0,
    },
  });
}

// PATCH /api/tasks/:id — 수정(팀장·부팀장·과장·부과장) / 팀원은 본인 담당 업무의 status만
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const task: any = await Task.findById(params.id);
  if (!task) return json({ error: "업무를 찾을 수 없습니다." }, 404);

  const teamIds = (task.teamIds ?? []).map((t: any) => String(t));
  const assigneeIds = (task.assignees ?? []).map((a: any) => String(a));
  // 일정 변경 감지용 원본 시각 (수정 적용 전에 캡처)
  const oldStart = task.startDate, oldEnd = task.endDate, oldAllDay = task.allDay;
  const d = parsed.data;
  const keys = Object.keys(d);
  const statusOnly = keys.length === 1 && keys[0] === "status";

  if (canEditTaskDoc(user, teamIds, task.createdBy ? String(task.createdBy) : null)) {
    // 전체 필드 수정 가능 (역할 권한 또는 본인이 만든 일정)
  } else if (statusOnly && canChangeStatusAny(user, teamIds, assigneeIds)) {
    // 팀원: 본인 담당 업무의 상태만 (설계 3.2)
  } else {
    return json({ error: "이 업무를 수정할 권한이 없습니다." }, 403);
  }

  // 팀을 변경하는 경우, 새 팀 전부에 등록 권한이 있어야 함 (접근 불가 팀 태깅 방지)
  if (d.teamIds !== undefined && !canCreateTaskInAll(user, d.teamIds)) {
    return json({ error: "선택한 팀 중 권한이 없는 팀이 있습니다." }, 403);
  }

  if (d.title !== undefined) task.title = d.title;
  if (d.description !== undefined) task.description = d.description;
  if (d.teamIds !== undefined) task.teamIds = d.teamIds;
  if (d.categoryId !== undefined) task.categoryId = d.categoryId || null;
  // 새로 추가된 담당자에게 알림 (본인 제외)
  const addedAssignees =
    d.assignees !== undefined ? d.assignees.filter((a) => !assigneeIds.includes(a) && a !== user.id) : [];
  if (d.assignees !== undefined) task.assignees = d.assignees;
  if (d.startDate !== undefined) task.startDate = new Date(d.startDate);
  if (d.endDate !== undefined) task.endDate = new Date(d.endDate);
  if (d.allDay !== undefined) task.allDay = d.allDay;
  if (d.status !== undefined) task.status = d.status;
  if (d.priority !== undefined) task.priority = d.priority;
  if (d.location !== undefined) task.location = d.location;

  if (task.endDate < task.startDate) {
    return json({ error: "종료일이 시작일보다 빠를 수 없습니다." }, 400);
  }

  // 장비 연동 동기화 — 장비 목록이 오거나, 기간이 바뀌어 기존 연동 예약을 옮겨야 할 때
  const timeChanged = d.startDate !== undefined || d.endDate !== undefined || d.allDay !== undefined;
  let equipTarget: string[] | null = null;
  if (d.resourceIds !== undefined) {
    equipTarget = d.resourceIds;
  } else if (timeChanged) {
    const cur: any[] = await Reservation.find({ relatedTaskId: task._id, status: "booked" }).select("resourceId").lean();
    if (cur.length > 0) equipTarget = cur.map((r) => String(r.resourceId));
  }
  const window = taskWindow(task);
  if (equipTarget && equipTarget.length > 0) {
    // 새로 추가되는 장비만 상태 검사 — 이미 빌려둔 장비가 도중에 고장 처리돼도 일정 수정은 막지 않는다
    const already: any[] = await Reservation.find({ relatedTaskId: task._id, status: "booked" }).select("resourceId").lean();
    const alreadySet = new Set(already.map((r) => String(r.resourceId)));
    const added = equipTarget.filter((rid) => !alreadySet.has(rid));
    if (added.length > 0) {
      const unavailable = await findUnavailableResources(added);
      if (unavailable.length > 0) return json({ error: unavailableMessage(unavailable) }, 409);
    }
    const conflicts = await findConflicts(equipTarget, window, String(task._id));
    if (conflicts.length > 0) return json({ error: conflictMessage(conflicts) }, 409);
  }

  await task.save();
  if (equipTarget !== null) {
    // 장비별 담당자 — 이 일정의 담당자(또는 등록자·수정자)만 허용
    const ownerAllowed = new Set([...(task.assignees ?? []).map(String), String(task.createdBy ?? ""), user.id]);
    const owners: Record<string, string> = {};
    for (const [rid, uid] of Object.entries(d.resourceOwners ?? {})) {
      if (equipTarget.includes(rid) && ownerAllowed.has(uid)) owners[rid] = uid;
    }
    await syncTaskReservations(task, equipTarget, window, user.id, owners);
  }
  await logActivity({
    actorId: user.id,
    actorName: user.name,
    action: statusOnly ? "status" : "update",
    targetTitle: task.title,
    meta: statusOnly ? { status: task.status } : undefined,
  });
  if (addedAssignees.length > 0) {
    await notify(addedAssignees, {
      type: "task_assigned",
      title: "업무 담당자로 지정됐어요",
      body: task.title,
      link: `/calendar?task=${String(task._id)}`,
    });
  }
  // 일정(시각)이 실제로 바뀌면 기존 담당자에게 변경 알림 — 방금 추가된 담당자(task_assigned로 이미 통지)·수정자 제외
  const rescheduled =
    (d.startDate !== undefined && new Date(oldStart).getTime() !== task.startDate.getTime()) ||
    (d.endDate !== undefined && new Date(oldEnd).getTime() !== task.endDate.getTime()) ||
    (d.allDay !== undefined && oldAllDay !== task.allDay);
  if (rescheduled) {
    const changeTargets = (task.assignees ?? [])
      .map(String)
      .filter((a: string) => a !== user.id && !addedAssignees.includes(a));
    if (changeTargets.length > 0) {
      const when = task.allDay
        ? `${fmtDay(task.startDate)} 종일`
        : `${fmtDateTime(task.startDate)} ~ ${fmtTime(task.endDate)}`;
      await notify(changeTargets, {
        type: "change",
        title: "담당 업무 일정이 변경됐어요",
        body: `${task.title}\n🕑 ${when}`,
        link: `/calendar?task=${String(task._id)}`,
      });
    }
  }
  return json({ id: String(task._id) });
}

// DELETE /api/tasks/:id — 삭제는 팀장·Admin만 (설계 확정)
// ?scope=series : 이 업무가 속한 반복 전체 삭제
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const task: any = await Task.findById(params.id).lean();
  if (!task) return json({ error: "업무를 찾을 수 없습니다." }, 404);

  const teamIds = (task.teamIds ?? []).map((t: any) => String(t));
  if (!canDeleteTaskDoc(user, teamIds, task.createdBy ? String(task.createdBy) : null)) {
    return json({ error: "삭제는 팀장·최고관리자 또는 본인이 만든 일정만 가능합니다." }, 403);
  }

  // 소프트 삭제 — 30일 내 휴지통에서 복구 가능, 이후 크론이 완전 삭제
  const scope = new URL(req.url).searchParams.get("scope");
  if (scope === "series" && task.recurrenceId) {
    const series: any[] = await Task.find({ recurrenceId: task.recurrenceId }).select("_id assignees").lean();
    const ids = series.map((t: any) => t._id);
    const r = await Task.updateMany({ recurrenceId: task.recurrenceId }, { $set: { deletedAt: new Date() } });
    await cancelTaskReservations(ids); // 연동 장비 예약도 취소
    await logActivity({
      actorId: user.id, actorName: user.name, action: "delete",
      targetTitle: `${task.title} (반복 ${r.modifiedCount}건)`,
    });
    // 반복 전체 회차 담당자 합집합에 삭제 알림 (본인 제외)
    const delTargets = series.flatMap((t: any) => (t.assignees ?? []).map(String)).filter((a: string) => a !== user.id);
    if (delTargets.length > 0) {
      await notify(delTargets, { type: "change", title: "담당 업무(반복 일정)가 삭제됐어요", body: task.title });
    }
    return json({ deleted: true, count: r.modifiedCount });
  }

  await Task.updateOne({ _id: params.id }, { $set: { deletedAt: new Date() } });
  await cancelTaskReservations([task._id]); // 연동 장비 예약도 취소
  await logActivity({ actorId: user.id, actorName: user.name, action: "delete", targetTitle: task.title });
  const delTargets = (task.assignees ?? []).map(String).filter((a: string) => a !== user.id);
  if (delTargets.length > 0) {
    await notify(delTargets, { type: "change", title: "담당 업무가 삭제됐어요", body: task.title });
  }
  return json({ deleted: true });
}
