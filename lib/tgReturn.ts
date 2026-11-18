import { Reservation } from "@/models/Reservation";
import { Resource } from "@/models/Resource";
import { esc, answerCallback, editTelegramMessage, type TgButton } from "./telegram";
import { canMarkReturned, type SessionUser } from "./permissions";
import { returnReservations } from "./returnOps";
import { myTaskReservations } from "./tgPipeline";
import { setDraft, clearDraft, type Draft } from "./tgDraft";
import type { TgReply } from "./telegramCommands";

// 텔레그램 반납 체크리스트 — 배터리 충전 / 메모리 백업·포맷 / 외관·작동 이상 없음 → [반납 완료]
// 이상이 있으면 [⚠ 이상 있음] → 다음 메시지로 받은 내용과 함께 반납 + 장비 담당·과장 알림
// target: t<taskId> (이 촬영의 내 장비 전부) | r<reservationId> (예약 1건)
// 콜백: rc:<target>:<bits> 체크 토글 화면 / rf: 반납 완료 / ri: 이상 있음 / rx: 이상 입력 취소
// bits = 배터리·메모리·이상없음 순서의 "0/1" 3자리

const ITEMS = [
  { label: "🔋 배터리 충전", },
  { label: "💾 메모리 백업·포맷" },
  { label: "🛠 외관·작동 이상 없음" },
] as const;

const cleanBits = (b: string) => (/^[01]{3}$/.test(b) ? b : "000");
const flip = (b: string, i: number) => b.slice(0, i) + (b[i] === "1" ? "0" : "1") + b.slice(i + 1);

/** 대상 예약 (booked + 반납 권한 있는 것) */
async function loadTarget(user: SessionUser, target: string): Promise<{ id: string; name: string }[]> {
  if (target.startsWith("t")) return myTaskReservations(user, target.slice(1));
  if (target.startsWith("r")) {
    const r: any = await Reservation.findById(target.slice(1)).select("resourceId reservedBy status").lean();
    if (!r || r.status !== "booked") return [];
    const res: any = await Resource.findById(r.resourceId).select("name managerId").lean();
    if (!canMarkReturned(user, String(r.reservedBy), res?.managerId ? String(res.managerId) : null)) return [];
    return [{ id: String(r._id), name: res?.name ?? "장비" }];
  }
  return [];
}

function namesLine(list: { name: string }[]) {
  const n = list.map((x) => x.name);
  return `${n.slice(0, 4).join(", ")}${n.length > 4 ? ` 외 ${n.length - 4}개` : ""}`;
}

export function renderChecklist(target: string, bits: string, list: { name: string }[]): { text: string; buttons: TgButton[][] } {
  const b = cleanBits(bits);
  return {
    text: `📦 <b>장비 반납 (${list.length}개)</b>\n${esc(namesLine(list))}\n\n해당하는 항목을 눌러 체크한 뒤 [반납 완료]를 눌러주세요.`,
    buttons: [
      ...ITEMS.map((it, i) => [{ text: `${b[i] === "1" ? "✅" : "⬜"} ${it.label}`, data: `rc:${target}:${flip(b, i)}` }]),
      [{ text: "📤 반납 완료", data: `rf:${target}:${b}` }, { text: "⚠ 이상 있음", data: `ri:${target}:${b}` }],
    ],
  };
}

/** /내예약·미반납 알림의 [반납] 버튼(ret:<rid>)도 이 체크리스트로 연결 */
export async function handleReturnCallback(p: { user: SessionUser; chatId: string; messageId: number; callbackId: string; data: string }) {
  const parts = p.data.split(":");
  const action = parts[0];
  const target = action === "ret" ? `r${parts[1]}` : parts[1];
  const bits = cleanBits(parts[2] ?? "000");
  const list = await loadTarget(p.user, target);
  if (list.length === 0) {
    await answerCallback(p.callbackId, "반납할 장비가 없어요 (이미 반납됐거나 권한이 없어요).");
    await editTelegramMessage(p.chatId, p.messageId, "✅ 반납할 장비가 없어요. 이미 반납 처리됐거나 반납 권한이 없는 예약이에요.");
    return;
  }

  if (action === "ret" || action === "rc" || action === "rx") {
    if (action === "rx") await clearDraft(p.user.id);
    await answerCallback(p.callbackId);
    const r = renderChecklist(target, bits, list);
    await editTelegramMessage(p.chatId, p.messageId, r.text, { html: true, buttons: r.buttons });
    return;
  }

  if (action === "rf") {
    if (bits[2] !== "1") {
      await answerCallback(p.callbackId, "외관·작동에 이상이 없으면 체크해 주세요. 문제가 있으면 [⚠ 이상 있음]을 눌러주세요.");
      return;
    }
    await answerCallback(p.callbackId, "반납 처리 중…");
    const out = await returnReservations(p.user, list.map((x) => x.id), { battery: bits[0] === "1", memory: bits[1] === "1", condition: true, note: "" }, "텔레그램");
    await editTelegramMessage(p.chatId, p.messageId, resultText(out, p.user, bits, ""), { html: true });
    return;
  }

  if (action === "ri") {
    // 다음 메시지를 이상 내용으로 받는다 (30분 안)
    await setDraft(p.user.id, { kind: "issue", target, bits, at: new Date() });
    await answerCallback(p.callbackId);
    await editTelegramMessage(p.chatId, p.messageId,
      `⚠ <b>어떤 문제인지 이 대화방에 메시지로 보내주세요.</b>\n예) 배터리 1개 부풀음, 렌즈 앞캡 분실\n\n${esc(namesLine(list))}\n보내면 반납 처리되고 장비 담당·과장에게 알림이 가요.`,
      { html: true, buttons: [[{ text: "↩ 체크리스트로 돌아가기", data: `rx:${target}:${bits}` }]] });
    return;
  }
  await answerCallback(p.callbackId);
}

/** 이상 내용 메시지 수신 → 반납 + 이상 신고 */
export async function handleIssueText(user: SessionUser, draft: Extract<Draft, { kind: "issue" }>, text: string): Promise<TgReply> {
  await clearDraft(user.id);
  const note = text.trim().slice(0, 300);
  const list = await loadTarget(user, draft.target);
  if (list.length === 0) return "✅ 반납할 장비가 없어요. 이미 반납 처리된 것 같아요.";
  const bits = cleanBits(draft.bits);
  const out = await returnReservations(user, list.map((x) => x.id), { battery: bits[0] === "1", memory: bits[1] === "1", condition: false, note }, "텔레그램");
  return { text: resultText(out, user, bits, note), html: true };
}

function resultText(out: { returnedNames: string[]; late: number; skipped: { name: string; reason: string }[] }, user: SessionUser, bits: string, note: string) {
  if (out.returnedNames.length === 0) {
    return `ℹ 반납된 장비가 없어요.${out.skipped.length ? `\n${out.skipped.map((s) => `· ${esc(s.name)} — ${s.reason}`).join("\n")}` : ""}`;
  }
  const checks = ITEMS.map((it, i) => `${bits[i] === "1" ? "✅" : "⬜"} ${it.label.replace(/^\S+ /, "")}`);
  checks[2] = note ? "⚠ 이상 있음" : "✅ 이상 없음";
  return [
    `✅ <b>반납 완료 ${out.returnedNames.length}개</b> — ${esc(user.name ?? "")}${out.late ? ` (지연 ${out.late}건)` : ""}`,
    esc(namesLine(out.returnedNames.map((name) => ({ name })))),
    checks.join(" · "),
    note ? `⚠ ${esc(note)}\n→ 장비 담당·과장에게 알렸어요.` : "",
    out.skipped.length ? `건너뜀: ${out.skipped.map((s) => `${esc(s.name)}(${s.reason})`).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}
