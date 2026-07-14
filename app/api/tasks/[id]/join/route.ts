import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { canCreateTaskInAll } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { z } from "zod";

const joinSchema = z.object({
  teamIds: z.array(z.string().min(1)).min(1, "추가할 팀을 선택하세요"),
  assignees: z.array(z.string()).optional().default([]),
});

// POST /api/tasks/:id/join — 기존 일정에 팀 참여 (중복 등록 대신 팀·담당자만 추가)
// 권한: 그 팀들로 일정을 "새로 등록"할 수 있는 사람이면 참여도 가능 (같은 기준).
// 일정 본문(제목·날짜 등)은 건드리지 않으므로 다른 팀 일정 수정 권한은 필요 없다.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
  const d = parsed.data;

  if (!canCreateTaskInAll(user, d.teamIds)) {
    return json({ error: "그 팀으로 일정에 참여할 권한이 없어요." }, 403);
  }

  await connectDB();
  const task: any = await Task.findById(params.id);
  if (!task) return json({ error: "일정을 찾을 수 없습니다." }, 404);

  const existingTeams = new Set((task.teamIds ?? []).map(String));
  const newTeams = d.teamIds.filter((id) => !existingTeams.has(id));
  const existingAssignees = new Set((task.assignees ?? []).map(String));
  const newAssignees = d.assignees.filter((id) => !existingAssignees.has(id));
  if (newTeams.length === 0 && newAssignees.length === 0) {
    return json({ error: "이미 이 일정에 참여 중인 팀이에요." }, 400);
  }

  task.teamIds.push(...newTeams);
  task.assignees.push(...newAssignees);
  await task.save();
  await logActivity({ actorId: user.id, actorName: user.name, action: "update", targetTitle: `${task.title} (팀 참여)` });

  // 일정 등록자 + 새 담당자에게 알림 (본인 제외)
  const targets = new Set<string>(newAssignees);
  if (task.createdBy) targets.add(String(task.createdBy));
  targets.delete(user.id);
  if (targets.size > 0) {
    await notify(Array.from(targets), {
      type: "task_assigned",
      title: "일정에 팀이 참여했어요",
      body: task.title,
      link: `/calendar?task=${task._id}`,
    });
  }

  return json({ id: String(task._id), addedTeams: newTeams.length, addedAssignees: newAssignees.length });
}
