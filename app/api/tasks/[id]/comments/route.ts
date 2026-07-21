import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import { Comment } from "@/models/Comment";
import "@/models/User";
import { requireActiveUser, json, limitWrites, badId } from "@/lib/api";
import { canViewAllTeams, type SessionUser } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { touchChanged } from "@/lib/changes";

// 업무 열람 권한: 전사 역할이거나, 업무의 팀에 소속(1인 1팀)
function canViewTask(user: SessionUser, teamIds: string[]) {
  if (canViewAllTeams(user)) return true;
  return user.teamId != null && teamIds.includes(user.teamId);
}

// GET /api/tasks/:id/comments — 댓글 목록
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const task: any = await Task.findById(params.id).select("teamIds").lean();
  if (!task) return json({ error: "업무를 찾을 수 없습니다." }, 404);
  const teamIds = (task.teamIds ?? []).map((t: any) => String(t));
  if (!canViewTask(user, teamIds)) return json({ error: "열람 권한이 없습니다." }, 403);

  const comments = await Comment.find({ taskId: params.id })
    .populate("authorId", "name")
    .sort({ createdAt: 1 })
    .lean();

  return json({
    comments: comments.map((c: any) => ({
      id: String(c._id),
      author: c.authorId ? { id: String(c.authorId._id), name: c.authorId.name } : null,
      content: c.content,
      createdAt: c.createdAt,
    })),
  });
}

// POST /api/tasks/:id/comments — 댓글 작성 (열람 가능자 누구나)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const limited = await limitWrites(`comment:${user.id}`, 30, 10 * 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const content = (body?.content ?? "").toString().trim();
  if (!content) return json({ error: "내용을 입력하세요." }, 400);
  if (content.length > 1000) return json({ error: "댓글은 1000자 이내로 입력하세요." }, 400);

  await connectDB();
  const task: any = await Task.findById(params.id).select("teamIds title assignees createdBy").lean();
  if (!task) return json({ error: "업무를 찾을 수 없습니다." }, 404);
  const teamIds = (task.teamIds ?? []).map((t: any) => String(t));
  if (!canViewTask(user, teamIds)) return json({ error: "댓글 권한이 없습니다." }, 403);

  const c = await Comment.create({ taskId: params.id, authorId: user.id, content });
  await touchChanged("task"); // 다른 사람 상세창에 댓글 자동 반영

  // 담당자 + 등록자에게 알림 (작성자 본인 제외)
  const targets = [...(task.assignees ?? []).map(String), task.createdBy ? String(task.createdBy) : ""]
    .filter((id) => id && id !== user.id);
  await notify(targets, {
    type: "comment",
    title: `${user.name} 님이 댓글을 남겼어요`,
    body: `${task.title} — ${content.length > 40 ? content.slice(0, 40) + "…" : content}`,
    link: `/calendar?task=${params.id}`,
  });

  return json({ id: String(c._id) }, 201);
}
