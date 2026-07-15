import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import { User } from "@/models/User";
import "@/models/Team";
import { requireActiveUser, json, limitWrites } from "@/lib/api";
import { canCreateTaskInAll } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { touchChanged } from "@/lib/changes";
import { notify } from "@/lib/notify";
import { z } from "zod";

const joinSchema = z.object({
  teamIds: z.array(z.string().min(1)).min(1, "추가할 팀을 선택하세요"),
  assignees: z.array(z.string()).optional().default([]),
});

// POST /api/tasks/:id/join — 기존 일정에 팀 참여 (중복 등록 대신 팀·담당자만 추가)
// 권한: 실제로 "추가하는 팀"에 대해 일정을 새로 만들 수 있는 사람이면 참여 가능.
// 담당자는 "관여된 팀(기존+추가)의 실제 소속 활성 사용자"만 허용 — 임의 사용자 주입·알림 스팸 차단.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const limited = await limitWrites(`join:${user.id}`, 30, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
  const d = parsed.data;

  await connectDB();
  const task: any = await Task.findById(params.id).lean(); // findById=findOne → deletedAt 소프트삭제 자동 제외
  if (!task) return json({ error: "일정을 찾을 수 없습니다." }, 404);

  const existingTeams: string[] = (task.teamIds ?? []).map(String);
  const existingTeamSet = new Set(existingTeams);
  const newTeams = d.teamIds.filter((id) => !existingTeamSet.has(id));
  // 추가하는 팀에 대해서만 등록 권한 검증 (이미 있는 팀은 통과 목적이 아님)
  if (newTeams.length > 0 && !canCreateTaskInAll(user, newTeams)) {
    return json({ error: "그 팀으로 일정에 참여할 권한이 없어요." }, 403);
  }

  // 담당자 후보 = 관여된 팀(기존+추가)의 활성 사용자만 (임의 userId·타 팀 사용자 주입 방지)
  const existingAssignees = new Set((task.assignees ?? []).map(String));
  const wantAssignees = d.assignees.filter((id) => !existingAssignees.has(id));
  let newAssignees: string[] = [];
  if (wantAssignees.length > 0) {
    const allTeams = Array.from(new Set(existingTeams.concat(newTeams)));
    const valid: any[] = await User.find({
      _id: { $in: wantAssignees }, status: "active", teamId: { $in: allTeams },
    }).select("_id").lean();
    const validSet = new Set(valid.map((u) => String(u._id)));
    newAssignees = wantAssignees.filter((id) => validSet.has(id));
  }

  if (newTeams.length === 0 && newAssignees.length === 0) {
    return json({ error: "이미 이 일정에 참여 중이에요." }, 400);
  }

  // 원자 추가 — 동시 참여 시 lost update 방지 ($addToSet, 소프트삭제 재검사)
  const upd: any = {};
  if (newTeams.length > 0) upd.teamIds = { $each: newTeams };
  if (newAssignees.length > 0) upd.assignees = { $each: newAssignees };
  const r = await Task.updateOne({ _id: params.id, deletedAt: null }, { $addToSet: upd });
  if (r.matchedCount === 0) return json({ error: "일정을 찾을 수 없습니다." }, 404);

  await logActivity({ actorId: user.id, actorName: user.name, action: "update", targetTitle: `${task.title} (팀 참여)` });
  await touchChanged("task");

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
