import { connectDB } from "@/lib/mongodb";
import { Notification } from "@/models/Notification";
import { requireActiveUser, json } from "@/lib/api";

// GET /api/notifications — 내 알림 최근 30개 + 안 읽은 개수
// ?before=<ISO> : 그 시각 이전 알림 30개 (더 보기 페이지네이션)
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const before = new URL(req.url).searchParams.get("before");
  const q: any = { userId: user.id };
  if (before) {
    const d = new Date(before);
    if (!isNaN(d.getTime())) q.createdAt = { $lt: d };
  }
  const [list, unread] = await Promise.all([
    Notification.find(q).sort({ createdAt: -1 }).limit(31).lean(), // 31개 조회 → 30개 반환 + 더 있는지 판단
    Notification.countDocuments({ userId: user.id, read: false }),
  ]);
  const hasMore = list.length > 30;
  if (hasMore) list.pop();

  return json({
    unread,
    hasMore,
    notifications: list.map((n: any) => ({
      id: String(n._id),
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read,
      createdAt: n.createdAt,
    })),
  });
}

// PATCH /api/notifications — 읽음 처리. body: { ids: string[] } 또는 { all: true }
export async function PATCH(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "잘못된 요청입니다." }, 400);

  await connectDB();
  if (body.all === true) {
    await Notification.updateMany({ userId: user.id, read: false }, { $set: { read: true } });
  } else if (Array.isArray(body.ids) && body.ids.length > 0 && body.ids.length <= 100) {
    await Notification.updateMany({ _id: { $in: body.ids }, userId: user.id }, { $set: { read: true } });
  } else {
    return json({ error: "잘못된 요청입니다." }, 400);
  }
  return json({ ok: true });
}
