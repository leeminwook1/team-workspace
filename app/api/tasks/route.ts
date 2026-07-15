import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import "@/models/Team";
import "@/models/User";
import "@/models/Category";
import { requireActiveUser, json, limitWrites } from "@/lib/api";
import { canCreateTaskInAll, visibleTeamIds } from "@/lib/permissions";
import { taskCreateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { filterValidAssignees } from "@/lib/assignees";
import { Reservation } from "@/models/Reservation";
import { taskWindow, findConflicts, conflictMessage, syncTaskReservations, findUnavailableResources, unavailableMessage } from "@/lib/taskReservations";
import { addInterval, RECUR_BATCH_CAP } from "@/lib/recurrence";

function serialize(t: any, resourcesByTask?: Map<string, { id: string; name: string }[]>) {
  return {
    resources: resourcesByTask?.get(String(t._id)) ?? [],
    id: String(t._id),
    title: t.title,
    description: t.description,
    teams: (t.teamIds ?? [])
      .filter(Boolean)
      .map((tm: any) => ({ id: String(tm._id ?? tm), name: tm.name ?? "", color: tm.color ?? "#8b95a1" })),
    category: t.categoryId
      ? { id: String(t.categoryId._id ?? t.categoryId), name: t.categoryId.name ?? "", color: t.categoryId.color ?? "#8b95a1" }
      : null,
    assignees: (t.assignees ?? []).map((a: any) => ({
      id: String(a._id ?? a),
      name: a.name ?? "",
    })),
    createdBy: t.createdBy?.name
      ? { id: String(t.createdBy._id ?? t.createdBy), name: t.createdBy.name }
      : (t.createdBy ? { id: String(t.createdBy), name: "" } : null),
    startDate: t.startDate,
    endDate: t.endDate,
    allDay: t.allDay,
    status: t.status,
    priority: t.priority,
    location: t.location,
    recurrenceId: t.recurrenceId ? String(t.recurrenceId) : null,
  };
}


// GET /api/tasks?from=&to=&team= — 기간·팀별 업무 조회 (조회 범위는 역할에 따름)
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const team = url.searchParams.get("team");

  await connectDB();
  const q: any = {};
  if (from && to) {
    q.startDate = { $lt: new Date(to) };
    q.endDate = { $gt: new Date(from) };
  } else {
    // 기간 미지정 시 전량 반환 방지 — 최근 1년 ~ 1년 뒤 창으로 제한
    q.startDate = { $lt: new Date(Date.now() + 365 * 86400_000) };
    q.endDate = { $gt: new Date(Date.now() - 365 * 86400_000) };
  }

  // 설계 3.2 — 전사 역할은 전체, 그 외는 소속 팀만 (teamIds 배열에 하나라도 포함되면 매치)
  const scope = visibleTeamIds(user);
  if (scope === "all") {
    if (team) q.teamIds = team;
  } else {
    if (scope.length === 0) return json({ tasks: [] });
    q.teamIds = team && scope.includes(team) ? team : { $in: scope };
  }

  const tasks = await Task.find(q)
    .populate("teamIds", "name color")
    .populate("categoryId", "name color")
    .populate("assignees", "name")
    .populate("createdBy", "name")
    .sort({ startDate: 1 })
    .lean();

  // 연동 장비 — 일괄 조회로 taskId → 자원 목록 매핑 (장비별 담당자 포함)
  const linked: any[] = await Reservation.find({
    relatedTaskId: { $in: tasks.map((t: any) => t._id) },
    status: "booked",
  }).populate("resourceId", "name").populate("reservedBy", "name").select("relatedTaskId resourceId reservedBy").lean();
  const resourcesByTask = new Map<string, { id: string; name: string; ownerId?: string; ownerName?: string }[]>();
  for (const r of linked) {
    if (!r.resourceId) continue;
    const key = String(r.relatedTaskId);
    if (!resourcesByTask.has(key)) resourcesByTask.set(key, []);
    resourcesByTask.get(key)!.push({
      id: String(r.resourceId._id),
      name: r.resourceId.name,
      ownerId: r.reservedBy ? String(r.reservedBy._id ?? r.reservedBy) : undefined,
      ownerName: r.reservedBy?.name ?? undefined,
    });
  }

  return json({ tasks: tasks.map((t: any) => serialize(t, resourcesByTask)) });
}

// POST /api/tasks — 업무 등록 (팀장·부팀장·과장·부과장·Admin)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const limited = await limitWrites(`taskcreate:${user.id}`, 20, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const d = parsed.data;
  if (!canCreateTaskInAll(user, d.teamIds)) {
    return json({ error: "선택한 팀 중 등록 권한이 없는 팀이 있습니다." }, 403);
  }
  if (new Date(d.endDate) < new Date(d.startDate)) {
    return json({ error: "종료가 시작보다 빠를 수 없습니다." }, 400);
  }

  await connectDB();
  // 담당자는 관여 팀의 활성 소속자만 — 임의 userId 주입·알림 스팸 차단 (join과 동일 정책)
  const validAssignees = await filterValidAssignees(d.assignees ?? [], d.teamIds);
  const { repeat, repeatUntil, resourceIds, resourceOwners, ...fields } = d;
  // 장비별 담당자 — 이 일정의 담당자(또는 등록자)만 허용, 그 외 값은 무시(등록자로 대체)
  const ownerAllowed = new Set([...validAssignees, user.id]);
  const owners: Record<string, string> = {};
  for (const [rid, uid] of Object.entries(resourceOwners ?? {})) {
    if ((resourceIds ?? []).includes(rid) && ownerAllowed.has(uid)) owners[rid] = uid;
  }
  const base = {
    ...fields,
    assignees: validAssignees,
    categoryId: d.categoryId || null,
    createdBy: user.id,
  };
  const start = new Date(d.startDate);
  const end = new Date(d.endDate);

  // 대여 장비 — 반복 일정과는 함께 불가, 충돌 시 업무 생성 전에 거절
  const equip = resourceIds ?? [];
  if (equip.length > 0 && repeat && repeat !== "none") {
    return json({ error: "반복 일정에는 장비 예약을 함께 설정할 수 없습니다." }, 400);
  }
  const window = taskWindow({ startDate: start, endDate: end, allDay: d.allDay });
  if (equip.length > 0) {
    const unavailable = await findUnavailableResources(equip);
    if (unavailable.length > 0) return json({ error: unavailableMessage(unavailable) }, 409);
    const conflicts = await findConflicts(equip, window);
    if (conflicts.length > 0) return json({ error: conflictMessage(conflicts) }, 409);
  }

  // 담당자로 지정된 사람에게 알림 (등록자 본인 제외)
  const notifyAssignees = (taskId: string) =>
    notify(validAssignees.filter((a) => a !== user.id), {
      type: "task_assigned",
      title: "새 업무에 담당자로 지정됐어요",
      body: d.title,
      link: `/calendar?task=${taskId}`,
    });

  // 단건
  if (!repeat || repeat === "none") {
    const task = await Task.create({ ...base, startDate: start, endDate: end });
    let raced: string[] = [];
    if (equip.length > 0) ({ raced } = await syncTaskReservations(task, equip, window, user.id, owners));
    await logActivity({ actorId: user.id, actorName: user.name, action: "create", targetTitle: task.title });
    await notifyAssignees(String(task._id));
    // 동시 예약으로 일부 장비 연동이 밀렸으면 성공(201)이되 경고를 함께 반환
    const warning = raced.length > 0 ? `동시 예약으로 일부 장비 연동에 실패했어요: ${raced.join(", ")}` : undefined;
    return json({ id: String(task._id), ...(warning ? { warning } : {}) }, 201);
  }

  // 반복 — repeatUntil까지 오커런스 생성 (기본 3개월, 최대 60개)
  const until = repeatUntil ? new Date(repeatUntil) : addInterval(start, "monthly", 3);
  if (isNaN(until.getTime()) || until < start) {
    return json({ error: "반복 종료일이 시작일보다 빠를 수 없습니다." }, 400);
  }
  const untilEnd = new Date(until.getTime() + 86_400_000); // 종료일 그날까지 포함
  const duration = end.getTime() - start.getTime();
  const recurrenceId = new mongoose.Types.ObjectId();
  const docs: any[] = [];
  // 상한을 넘는 나머지 회차는 크론이 repeatFreq/repeatUntil을 보고 이어서 생성
  for (let i = 0; docs.length < RECUR_BATCH_CAP; i++) {
    const s = addInterval(start, repeat, i);
    if (s >= untilEnd) break;
    docs.push({ ...base, recurrenceId, repeatFreq: repeat, repeatUntil: untilEnd, startDate: s, endDate: new Date(s.getTime() + duration) });
  }
  const created = await Task.insertMany(docs);
  await logActivity({
    actorId: user.id, actorName: user.name, action: "create",
    targetTitle: `${d.title} (반복 ${created.length}회)`,
  });
  await notifyAssignees(String(created[0]._id));
  return json({ id: String(created[0]._id), count: created.length }, 201);
}
