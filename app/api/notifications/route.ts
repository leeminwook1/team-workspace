import { connectDB } from "@/lib/mongodb";
import { Notification } from "@/models/Notification";
import { requireActiveUser, json } from "@/lib/api";

// GET /api/notifications — 내 알림 최근 30개 + 안 읽은 개수
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const [list, unread] = await Promise.all([
    Notification.find({ userId: user.id }).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ userId: user.id, read: false }),
  ]);

  return json({
    unread,
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
