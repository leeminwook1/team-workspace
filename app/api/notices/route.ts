import { connectDB } from "@/lib/mongodb";
import { Notice } from "@/models/Notice";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canCreateNotice } from "@/lib/permissions";
import { noticeCreateSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity";
import { touchChanged } from "@/lib/changes";
import { notify } from "@/lib/notify";

function serialize(n: any, userId: string) {
  return {
    id: String(n._id),
    title: n.title,
    body: n.body ?? "",
    pinned: !!n.pinned,
    createdBy: n.createdBy?.name
      ? { id: String(n.createdBy._id ?? n.createdBy), name: n.createdBy.name }
      : (n.createdBy ? { id: String(n.createdBy), name: "" } : null),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    isNew: !(n.readBy ?? []).some((id: any) => String(id) === userId), // 이번 열람 전까지 안 읽은 공지
    readCount: (n.readBy ?? []).length,
  };
}

// GET /api/notices — 전체 공지 (고정 우선, 최신순). 열람과 동시에 읽음 처리.
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const list = await Notice.find({})
    .populate("createdBy", "name")
    .sort({ pinned: -1, createdAt: -1 })
    .limit(100)
    .lean();

  // 응답에는 열람 전 기준의 isNew를 담고, 안 읽은 공지는 지금 읽음 처리 (다음 방문부터 배지 제거)
  const out = list.map((n) => serialize(n, user.id));
  await Notice.updateMany({ readBy: { $ne: user.id } }, { $addToSet: { readBy: user.id } });

  return json({ notices: out });
}

// POST /api/notices — 공지 올리기 (전사 역할)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canCreateNotice(user)) return json({ error: "공지를 올릴 권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const parsed = noticeCreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);

  await connectDB();
  const d = parsed.data;
  const created = await Notice.create({
    title: d.title, body: d.body, pinned: d.pinned,
    createdBy: user.id,
    readBy: [user.id], // 작성자 본인은 읽음
  });
  await logActivity({ actorId: user.id, actorName: user.name, action: "create", targetTitle: `공지: ${created.title}` });
  await touchChanged("notice");

  // 전체 활성 사용자에게 알림 (작성자 제외)
  const users: any[] = await User.find({ status: "active" }).select("_id").lean();
  await notify(users.map((u) => String(u._id)).filter((id) => id !== user.id), {
    type: "notice",
    title: "📢 새 공지가 올라왔어요",
    body: created.title,
    link: "/notices",
  });

  return json({ id: String(created._id) }, 201);
}
