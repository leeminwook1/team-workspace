import { connectDB } from "@/lib/mongodb";
import { Types } from "mongoose";
import { Directive } from "@/models/Directive";
import "@/models/Team";
import "@/models/User";
import "@/models/Task";
import { requireActiveUser, json } from "@/lib/api";
import { canCreateDirective, canUseDirectives } from "@/lib/permissions";
import { directiveCreateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { getDeptId } from "@/lib/dept";
import { directiveScope } from "@/lib/directives";
import { filterValidAssignees } from "@/lib/assignees";
import { touchChanged } from "@/lib/changes";

function serialize(d: any) {
  return {
    id: String(d._id),
    title: d.title,
    body: d.body,
    team: d.teamId
      ? { id: String(d.teamId._id ?? d.teamId), name: d.teamId.name ?? "", color: d.teamId.color ?? "#8b95a1" }
      : null,
    createdBy: d.createdBy?.name
      ? { id: String(d.createdBy._id ?? d.createdBy), name: d.createdBy.name }
      : (d.createdBy ? { id: String(d.createdBy), name: "" } : null),
    dueDate: d.dueDate,
    priority: d.priority,
    status: d.status,
    assignments: (d.assignments ?? []).map((a: any) => ({
      id: String(a._id),
      user: a.userId?.name
        ? { id: String(a.userId._id ?? a.userId), name: a.userId.name }
        : (a.userId ? { id: String(a.userId), name: "" } : null),
      note: a.note ?? "",
      done: !!a.done,
      doneAt: a.doneAt ?? null,
      readAt: a.readAt ?? null,
      taskId: a.taskId ? String(a.taskId) : null,
    })),
    converted: !!d.convertedTaskId, // 지시 전체가 일정으로 등록됐는지
    createdAt: d.createdAt,
    readAt: d.readAt ?? null, // 팀장 열람 시각 (읽음 확인)
    doneAt: d.doneAt ?? null, // 완료 시각 (처리 소요 리포트)
  };
}

// GET /api/directives — TODO 목록 (과장·admin=전체, 과원=자기가 받은 것만)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canUseDirectives(user)) return json({ directives: [] });

  await connectDB();
  const q: any = directiveScope(user);
  if (!canCreateDirective(user)) {
    // 읽음 확인 — 받은 과원이 목록을 열면 내 몫을 읽음 처리 (과장 화면에 표시)
    const r = await Directive.updateMany(
      { assignments: { $elemMatch: { userId: user.id, readAt: null } } },
      { $set: { "assignments.$[me].readAt": new Date() } },
      { arrayFilters: [{ "me.userId": new Types.ObjectId(user.id), "me.readAt": null }] }
    );
    if (r.modifiedCount) await touchChanged("directive");
  }

  const list = await Directive.find(q)
    .populate("teamId", "name color")
    .populate("createdBy", "name")
    .populate("assignments.userId", "name")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return json({ directives: list.map(serialize) });
}

// POST /api/directives — TODO 내리기 (과장 → 과원)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canCreateDirective(user)) return json({ error: "TODO는 과장만 내릴 수 있어요." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = directiveCreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const d = parsed.data;
  await connectDB();
  const deptId = await getDeptId();
  if (!deptId) return json({ error: "과 설정이 아직 없습니다." }, 500);

  // 받는 사람은 과의 활성 소속자만 (임의 userId 주입 차단)
  const valid = new Set(await filterValidAssignees(d.assignments.map((a) => a.userId), [deptId]));
  const seen = new Set<string>();
  const assignments = d.assignments
    .filter((a) => valid.has(a.userId) && !seen.has(a.userId) && seen.add(a.userId))
    .map((a) => ({ userId: a.userId, note: a.note ?? "", done: false }));
  if (assignments.length === 0) return json({ error: "받을 과원을 1명 이상 골라주세요." }, 400);

  const created = await Directive.create({
    title: d.title,
    body: d.body,
    teamId: deptId,
    priority: d.priority,
    dueDate: d.dueDate ? new Date(d.dueDate) : null,
    createdBy: user.id,
    assignments,
  });
  await logActivity({ actorId: user.id, actorName: user.name, action: "create", targetType: "directive", targetTitle: created.title });

  // 받는 과원에게 알림 (각자 담당 내용 포함)
  const due = created.dueDate
    ? `\n⏰ ${new Date(created.dueDate).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" })}까지`
    : "";
  for (const a of assignments) {
    if (a.userId === user.id) continue;
    await notify([a.userId], {
      type: "directive",
      title: `📝 새 TODO — ${created.title}`,
      body: `${user.name ?? "과장"}님이 보냈어요${a.note ? `\n👉 ${a.note}` : ""}${d.body ? `\n${d.body.slice(0, 200)}` : ""}${due}`,
      link: `/directives?q=${encodeURIComponent(created.title)}`,
    });
  }

  return json({ id: String(created._id) }, 201);
}
