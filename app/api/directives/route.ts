import { connectDB } from "@/lib/mongodb";
import { Directive } from "@/models/Directive";
import "@/models/Team";
import "@/models/User";
import "@/models/Task";
import { requireActiveUser, json } from "@/lib/api";
import { canCreateDirective, canUseDirectives } from "@/lib/permissions";
import { directiveCreateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { User } from "@/models/User";

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
      taskId: a.taskId ? String(a.taskId) : null,
    })),
    converted: !!d.convertedTaskId, // 지시 전체가 일정으로 등록됐는지
    createdAt: d.createdAt,
    readAt: d.readAt ?? null, // 팀장 열람 시각 (읽음 확인)
    doneAt: d.doneAt ?? null, // 완료 시각 (처리 소요 리포트)
  };
}

// GET /api/directives — 지시함 조회 (발신 그룹=전체, 팀장=소속 팀만)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canUseDirectives(user)) return json({ directives: [] });

  await connectDB();
  const q: any = {};
  // 발신 그룹(admin·과장·부과장·서기)이 아니면 팀장 → 소속 팀 지시만
  if (!canCreateDirective(user)) {
    if (!user.teamId) return json({ directives: [] });
    q.teamId = user.teamId;
    // 읽음 확인 — 수신자(팀장·부팀장)가 목록을 열람하면 미열람 지시를 읽음 처리
    await Directive.updateMany(
      { teamId: user.teamId, readAt: null },
      { $set: { readAt: new Date(), readBy: user.id } }
    );
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

// POST /api/directives — 지시 내리기 (전사 역할)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canCreateDirective(user)) return json({ error: "지시를 내릴 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = directiveCreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  const d = parsed.data;
  await connectDB();
  const created = await Directive.create({
    title: d.title,
    body: d.body,
    teamId: d.teamId,
    priority: d.priority,
    dueDate: d.dueDate ? new Date(d.dueDate) : null,
    createdBy: user.id,
  });
  await logActivity({ actorId: user.id, actorName: user.name, action: "create", targetType: "directive", targetTitle: created.title });

  // 대상 팀의 팀장·부팀장에게 알림
  const leads: any[] = await User.find({
    teamId: d.teamId, role: { $in: ["leader", "vice_leader"] }, status: "active",
  }).select("_id").lean();
  await notify(leads.map((l) => String(l._id)).filter((id) => id !== user.id), {
    type: "directive",
    title: "새 TODO 지시가 도착했어요",
    body: created.title,
    link: "/directives",
  });

  return json({ id: String(created._id) }, 201);
}
