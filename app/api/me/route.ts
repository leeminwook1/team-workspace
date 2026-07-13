import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { meUpdateSchema } from "@/lib/validations";
import { sendTelegram, telegramEnabled } from "@/lib/telegram";

// PATCH /api/me — 내 계정(이름·비밀번호·텔레그램 연동) 수정. 세션 유저 본인만 (id 파라미터 없음)
export async function PATCH(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const parsed = meUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0].message }, 400);
  const d = parsed.data;

  await connectDB();
  const me: any = await User.findById(user.id);
  if (!me) return json({ error: "계정을 찾을 수 없습니다." }, 404);

  if (d.name !== undefined) me.name = d.name.trim();

  if (d.newPassword) {
    if (!d.currentPassword) return json({ error: "현재 비밀번호를 입력하세요." }, 400);
    const ok = await bcrypt.compare(d.currentPassword, me.passwordHash);
    if (!ok) return json({ error: "현재 비밀번호가 일치하지 않습니다." }, 400);
    me.passwordHash = await bcrypt.hash(d.newPassword, 10);
  }

  // 텔레그램 연동 — 저장 후 테스트 메시지로 즉시 확인
  let telegramTest: boolean | null = null;
  if (d.telegramChatId !== undefined) {
    me.telegramChatId = d.telegramChatId.trim();
    if (me.telegramChatId) {
      // 한 텔레그램 = 한 계정 — 같은 챗이 다른 계정에 남아 있으면 해제 (명령 실행 계정 오인 방지)
      await User.updateMany({ _id: { $ne: me._id }, telegramChatId: me.telegramChatId }, { $set: { telegramChatId: "" } });
      telegramTest = telegramEnabled()
        ? await sendTelegram(me.telegramChatId, `✅ CHQ 알림 연동 완료!\n${me.name} 님, 이제 승인·배정·마감 알림을 여기로 받아요.`)
        : false;
    }
  }

  // 텔레그램 알림 수신 설정 — 전달된 항목만 갱신
  if (d.notifyPrefs) {
    for (const k of ["assign", "due", "directive", "equip"] as const) {
      if (typeof d.notifyPrefs[k] === "boolean") me.set(`notifyPrefs.${k}`, d.notifyPrefs[k]);
    }
  }

  await me.save();
  return json({ name: me.name, ...(telegramTest !== null ? { telegramTest } : {}) });
}
