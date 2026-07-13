import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import "@/models/Team";
import { requireActiveUser, json } from "@/lib/api";
import { canManageTeams } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { setBotCommands, telegramEnabled } from "@/lib/telegram";

// 봇 명령 메뉴 — 텔레그램 규격상 영문 소문자만 등록 가능 (한글 명령은 그대로 동작)
const BOT_COMMANDS = [
  { command: "today", description: "오늘 일정" },
  { command: "tomorrow", description: "내일 일정" },
  { command: "week", description: "이번 주 일정" },
  { command: "mytasks", description: "내 담당 업무" },
  { command: "reservations", description: "장비 예약 현황" },
  { command: "schedule", description: "일정 등록 — 제목 날짜 [시간]" },
  { command: "book", description: "장비 예약 — 장비명 날짜 [시간]" },
  { command: "link", description: "계정 연동 — 코드 6자리" },
  { command: "chatid", description: "이 대화방 챗 ID 확인" },
  { command: "help", description: "사용법 안내" },
];

// POST /api/admin/telegram — 봇 명령 메뉴 등록 (Admin). 텔레그램 / 입력 시 자동완성 메뉴에 표시.
export async function POST() {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageTeams(user)) return json({ error: "권한이 없습니다." }, 403);
  if (!telegramEnabled()) return json({ error: "서버에 봇 토큰(TELEGRAM_BOT_TOKEN)이 설정되지 않았습니다." }, 400);

  const ok = await setBotCommands(BOT_COMMANDS);
  if (!ok) return json({ error: "텔레그램 API 호출에 실패했습니다. 서버 로그를 확인하세요." }, 502);
  return json({ registered: BOT_COMMANDS.length });
}

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
