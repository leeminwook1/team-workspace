import { User } from "@/models/User";
import type { SessionUser, Role } from "./permissions";

// 텔레그램 개인 ID → 연동된 활성 계정 (같은 챗이 여러 계정에 남아 있으면 최근 것)
export async function findLinkedUser(telegramId: string): Promise<{ user: SessionUser; doc: any } | null> {
  if (!telegramId) return null;
  const doc: any = await User.findOne({ telegramChatId: telegramId, status: "active" }).sort({ updatedAt: -1 }).lean();
  if (!doc) return null;
  return {
    doc,
    user: { id: String(doc._id), name: doc.name, role: (doc.role ?? "member") as Role, teamId: doc.teamId ? String(doc.teamId) : null, status: doc.status },
  };
}

export const NOT_LINKED = "❌ 아직 계정이 연결되지 않았어요.\n사진과 워크스페이스 설정 → 텔레그램 알림에서 [연동 코드 발급] 후 봇과의 1:1 대화방에서 /연동 123456 을 보내주세요.";
