import { connectDB } from "@/lib/mongodb";
import { Feedback } from "@/models/Feedback";
import { User } from "@/models/User";
import { requireActiveUser, json, limitWrites } from "@/lib/api";
import { feedbackCreateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { touchChanged } from "@/lib/changes";
import { notify } from "@/lib/notify";

function serializeFeedback(f: any, userId: string) {
  return {
    id: String(f._id),
    type: f.type,
    title: f.title,
    body: f.body ?? "",
    status: f.status,
    createdBy: f.createdBy?.name
      ? { id: String(f.createdBy._id ?? f.createdBy), name: f.createdBy.name }
      : (f.createdBy ? { id: String(f.createdBy), name: "" } : null),
    votes: (f.votes ?? []).length,
    myVote: (f.votes ?? []).some((id: any) => String(id) === userId),
    comments: (f.comments ?? []).map((c: any) => ({
      id: String(c._id),
      user: c.userId?.name
        ? { id: String(c.userId._id ?? c.userId), name: c.userId.name }
        : (c.userId ? { id: String(c.userId), name: "" } : null),
      body: c.body,
      createdAt: c.createdAt,
    })),
    createdAt: f.createdAt,
  };
}

// GET /api/feedback — 전체 피드백 (모든 활성 사용자)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const list = await Feedback.find({})
    .populate("createdBy", "name")
    .populate("comments.userId", "name")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  return json({ feedback: list.map((f) => serializeFeedback(f, user.id)) });
}

// POST /api/feedback — 피드백 남기기 (모든 활성 사용자)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const limited = await limitWrites(`feedback:${user.id}`, 10, 10 * 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = feedbackCreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const d = parsed.data;
  const created = await Feedback.create({
    type: d.type, title: d.title, body: d.body,
    createdBy: user.id,
    votes: [user.id], // 본인 제안엔 기본 공감
  });
  await logActivity({ actorId: user.id, actorName: user.name, action: "create", targetTitle: `피드백: ${created.title}` });
  await touchChanged("feedback");

  // 처리 담당(admin)에게 알림
  const admins: any[] = await User.find({ role: "admin", status: "active" }).select("_id").lean();
  await notify(admins.map((a) => String(a._id)).filter((id) => id !== user.id), {
    type: "feedback",
    title: "💬 새 피드백이 등록됐어요",
    body: created.title,
    link: "/feedback",
  });

  return json({ id: String(created._id) }, 201);
}
