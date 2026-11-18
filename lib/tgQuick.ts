import { Category } from "@/models/Category";
import { esc, answerCallback, editTelegramMessage, type TgButton } from "./telegram";
import { parseQuickEntry, type QuickParsed } from "./quickEntry";
import { createTaskCore, createPersonalCore, type TgReply } from "./telegramCommands";
import { getDraft, setDraft, clearDraft } from "./tgDraft";
import type { SessionUser } from "./permissions";

// "그냥 쓰기" 등록 — 1:1 대화방에 / 없이 "내일 오후 3시~5시 촬영 연습" 처럼 보내면
// 웹 한 줄 입력과 같은 해석기(lib/quickEntry)로 읽고 [개인 일정] [📸 촬영] [일정] 중 고르게 한다.
// 콜백: qa:p 개인 / qa:s:<categoryId> 촬영(카테고리) / qa:t 일반 일정 / qa:x 취소

const KST = 9 * 3600_000;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** 서버 시간대와 무관하게 KST 기준으로 해석 — 해석기는 로컬 시각 getter만 쓰므로 KST 벽시계를 로컬 Date로 만들어 넘긴다 */
export function parseKst(text: string): QuickParsed {
  const k = new Date(Date.now() + KST);
  const nowLocal = new Date(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), k.getUTCHours(), k.getUTCMinutes());
  const today = `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}-${String(k.getUTCDate()).padStart(2, "0")}`;
  return parseQuickEntry(text, today, nowLocal);
}

/** "2026-11-20" + "15:00" (KST) → UTC Date */
function kstInstant(day: string, time = "00:00") {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - KST);
}

function toDates(p: QuickParsed) {
  if (p.allDay) return { startDate: new Date(p.startDate), endDate: new Date(p.endDate), allDay: true }; // 종일 = UTC 자정 저장 규칙
  return { startDate: kstInstant(p.startDate, p.startTime), endDate: kstInstant(p.startDate, p.endTime), allDay: false };
}

function label(p: QuickParsed) {
  const md = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DOW[d.getUTCDay()]})`; };
  const date = p.startDate === p.endDate ? md(p.startDate) : `${md(p.startDate)}~${md(p.endDate)}`;
  return `${date} ${p.allDay ? "종일" : `${p.startTime}–${p.endTime}`}`;
}

async function shootCategories() {
  const cats: any[] = await Category.find({ name: /촬영/, isActive: true }).select("name").sort({ order: 1, name: 1 }).limit(3).lean();
  return cats.map((c) => ({ id: String(c._id), name: c.name as string }));
}

/** 1:1 대화방의 / 없는 문장 */
export async function handleQuickText(user: SessionUser, text: string): Promise<TgReply> {
  const p = parseKst(text);
  // 날짜도 시간도 없는 말(인사 등)은 등록 제안을 하지 않는다
  if (!p.dateFound && p.allDay) return "✍️ 일정을 등록하려면 날짜나 시간을 같이 적어주세요.\n예) 내일 오후 3시~5시 촬영 연습\n\n명령어 안내는 /도움말";
  if (!p.title) return "🤔 무엇을 등록할지 제목도 같이 적어주세요.\n예) 내일 오후 3시~5시 촬영 연습\n\n명령어 안내는 /도움말";
  if (!p.allDay && p.endTime <= p.startTime) return "❌ 종료 시각이 시작보다 빨라요. 다시 적어주세요.";
  await setDraft(user.id, { kind: "text", text, at: new Date() });

  const cats = await shootCategories();
  const shootRow: TgButton[] = cats.length
    ? cats.map((c) => ({ text: `📸 ${c.name.length > 12 ? c.name.slice(0, 12) + "…" : c.name}`, data: `qa:s:${c.id}` }))
    : [];
  const buttons: TgButton[][] = [
    [{ text: "🔒 개인 일정", data: "qa:p" }, { text: "📅 과 일정", data: "qa:t" }],
    ...(shootRow.length ? [shootRow] : []),
    [{ text: "취소", data: "qa:x" }],
  ];
  const note = p.dateFound ? "" : "\n(날짜를 안 적어서 오늘로 잡았어요)";
  return {
    text: `📝 이렇게 등록할까요?\n<b>${esc(p.title)}</b>\n📅 ${label(p)}${p.location ? `\n📍 ${esc(p.location)}` : ""}${note}\n\n어디에 등록할지 골라주세요. 📸 촬영은 촬영 진행 관리가 켜져서 촬영 후 진행 버튼이 와요.`,
    html: true,
    buttons,
  };
}

/** qa:… */
export async function handleQuickCallback(p: { user: SessionUser; chatId: string; messageId: number; callbackId: string; data: string }) {
  const [, kind, catId] = p.data.split(":");
  if (kind === "x") {
    await clearDraft(p.user.id);
    await answerCallback(p.callbackId);
    await editTelegramMessage(p.chatId, p.messageId, "↩ 등록하지 않았어요.");
    return;
  }
  const draft = await getDraft(p.user.id);
  if (!draft || draft.kind !== "text") {
    await answerCallback(p.callbackId, "시간이 지나 등록 대기가 끝났어요. 다시 보내주세요.");
    await editTelegramMessage(p.chatId, p.messageId, "⌛ 등록 대기 시간이 지났어요. 문장을 다시 보내주세요.");
    return;
  }
  await clearDraft(p.user.id); // 두 번 눌러도 한 번만 등록
  await answerCallback(p.callbackId);
  const q = parseKst(draft.text);
  const d = toDates(q);

  let reply: TgReply;
  if (kind === "p") {
    reply = await createPersonalCore(p.user, { title: q.title, ...d, location: q.location });
  } else {
    let categoryId: string | null = null, catLabel = "";
    if (kind === "s") {
      const cats = await shootCategories();
      const c = cats.find((x) => x.id === catId);
      if (c) { categoryId = c.id; catLabel = c.name; }
    }
    reply = await createTaskCore(p.user, { title: q.title, ...d, location: q.location, categoryId, catLabel, pipelineOn: kind === "s" });
  }
  const r = typeof reply === "string" ? { text: reply } : reply;
  await editTelegramMessage(p.chatId, p.messageId, r.text, { html: typeof reply !== "string" && reply.html, buttons: typeof reply !== "string" ? reply.buttons : undefined });
}
