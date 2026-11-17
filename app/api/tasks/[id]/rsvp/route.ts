import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import { User } from "@/models/User";
import { requireActiveUser, json, badId } from "@/lib/api";
import { canEditTaskDoc, isTeamRole } from "@/lib/permissions";
import { touchChanged } from "@/lib/changes";
import {
  RSVP_STATUSES, applyResponse, rsvpSummary, rsvpTargetIds, sendRsvpRequest, defaultRsvpDeadline, type RsvpStatus,
} from "@/lib/rsvp";

// /api/tasks/:id/rsvp — 모임 참석 확인
//  GET    요약 + 명단(이름·응답·사유)
//  POST   { status, reason? }          내 응답 (과원)
//  PATCH  { on?, deadline?, remind? }  켜기/끄기·마감 변경·미응답자 재알림 (일정 수정 권한자)

async function load(id: string) {
  return Task.findById(id);
}

async function detail(task: any, meId: string) {
  const ids = Array.from(new Set([...(task.rsvp.targets ?? []).map(String), ...(task.rsvp.responses ?? []).map((r: any) => String(r.userId))]));
  const users: any[] = await User.find({ _id: { $in: ids } }).select("name role").lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const resp = new Map((task.rsvp.responses ?? []).map((r: any) => [String(r.userId), r]));
  const people = (task.rsvp.targets ?? []).map(String).map((id: string) => {
    const r: any = resp.get(id);
    return { id, name: byId.get(id)?.name ?? "?", status: (r?.status ?? null) as RsvpStatus | null, reason: r?.reason ?? "", at: r?.at ?? null };
  }).sort((a: any, b: any) => a.name.localeCompare(b.name, "ko"));
  return { summary: rsvpSummary(task.rsvp, meId), people };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;
  await connectDB();
  const task: any = await load(params.id);
  if (!task) return json({ error: "일정을 찾을 수 없습니다." }, 404);
  if (!task.rsvp?.on) return json({ summary: null, people: [] });
  return json(await detail(task, user.id));
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;
  const body = await req.json().catch(() => null);
  const status = body?.status as RsvpStatus;
  if (!RSVP_STATUSES.includes(status)) return json({ error: "응답을 골라주세요." }, 400);
  const reason = typeof body?.reason === "string" ? body.reason : undefined;

  await connectDB();
  const task: any = await load(params.id);
  if (!task) return json({ error: "일정을 찾을 수 없습니다." }, 404);
  if (!task.rsvp?.on) return json({ error: "참석 확인을 받지 않는 일정이에요." }, 409);
  const isTarget = (task.rsvp.targets ?? []).some((x: any) => String(x) === user.id);
  if (!isTarget && !isTeamRole(user.role)) return json({ error: "참석 확인 대상이 아니에요." }, 403);

  applyResponse(task, user.id, status, reason);
  await task.save();
  await touchChanged("task");
  return json(await detail(task, user.id));
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "잘못된 요청입니다." }, 400);

  await connectDB();
  const task: any = await load(params.id);
  if (!task) return json({ error: "일정을 찾을 수 없습니다." }, 404);
  if (!canEditTaskDoc(user, (task.teamIds ?? []).map(String), task.createdBy ? String(task.createdBy) : null)) {
    return json({ error: "참석 확인을 관리할 권한이 없습니다." }, 403);
  }

  let sendTo: string[] = [];
  let reminder = false;
  if (body.on === true && !task.rsvp?.on) {
    // 처음 켜면 과원 전체를 대상으로 잡고 요청을 보낸다 (본인은 화면에서 바로 응답)
    const targets = await rsvpTargetIds();
    task.rsvp.on = true;
    task.rsvp.targets = targets;
    if (!task.rsvp.deadline) task.rsvp.deadline = defaultRsvpDeadline(task.startDate);
    sendTo = targets.filter((id) => id !== user.id);
  } else if (body.on === false) {
    task.rsvp.on = false; // 응답 기록은 남겨두고 끈다 (다시 켜면 이어서)
  }
  if (body.deadline !== undefined) {
    const d = body.deadline ? new Date(body.deadline) : null;
    if (d && isNaN(d.getTime())) return json({ error: "날짜 형식이 잘못됐습니다." }, 400);
    task.rsvp.deadline = d;
  }
  if (body.remind === true) {
    if (!task.rsvp?.on) return json({ error: "참석 확인이 꺼져 있어요." }, 409);
    const answered = new Set((task.rsvp.responses ?? []).map((r: any) => String(r.userId)));
    sendTo = (task.rsvp.targets ?? []).map(String).filter((id: string) => !answered.has(id) && id !== user.id);
    reminder = true;
    task.rsvp.remindedAt = new Date();
  }
  task.markModified("rsvp");
  await task.save();
  await sendRsvpRequest(task, sendTo, { reminder });
  await touchChanged("task");
  return json({ ...(await detail(task, user.id)), sent: sendTo.length });
}
