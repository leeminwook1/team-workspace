import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

// GET /api/admin/telegram — 텔레그램 연동 현황 (Admin)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);

  await connectDB();
  const users = await User.find({ status: "active" })
    .populate("teamId", "name color")
    .select("name email role teamId telegramChatId updatedAt")
    .sort({ name: 1 })
    .lean();

  return json({
    users: users.map((u: any) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role ?? "member",
      team: u.teamId
        ? { id: String(u.teamId._id ?? u.teamId), name: u.teamId.name ?? "", color: u.teamId.color ?? "#8b95a1" }
        : null,
      linked: !!u.telegramChatId,
      // 챗 ID는 식별용으로 끝 4자리만 노출
      chatIdTail: u.telegramChatId ? `…${String(u.telegramChatId).slice(-4)}` : null,
    })),
  });
}

// DELETE /api/admin/telegram — 연동 해제 (Admin) body: { userId }
export async function DELETE(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);

  const body = await req.json().catch(() => null);
  const userId = body?.userId;
  if (!userId) return json({ error: "userId가 필요합니다." }, 400);

  await connectDB();
  const target: any = await User.findById(userId);
  if (!target) return json({ error: "사용자를 찾을 수 없습니다." }, 404);
  if (!target.telegramChatId) return json({ error: "이미 연동되어 있지 않습니다." }, 409);

  target.telegramChatId = "";
  target.tgLinkCode = "";
  target.tgLinkCodeExp = null;
  await target.save();

  await logActivity({
    actorId: user.id, actorName: user.name, action: "update", targetType: "user",
    targetTitle: target.name, meta: { detail: "텔레그램 연동 해제" },
  });
  return json({ unlinked: true });
}
