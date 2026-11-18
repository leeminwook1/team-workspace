import { Task } from "@/models/Task";
import { Reservation } from "@/models/Reservation";
import { Resource } from "@/models/Resource";
import { User } from "@/models/User";
import { esc, answerCallback, editTelegramMessage, type TgButton } from "./telegram";
import { STEP_KEYS, STEP_LABEL, nextStep, type StepKey } from "./pipeline";
import { applyPipelineStep, canStepPipeline } from "./pipelineOps";
import { canMarkReturned, type SessionUser } from "./permissions";

// 촬영 진행을 텔레그램 버튼으로 — 촬영 끝나면 [촬영 완료] → [백업 완료] → … → [보고 완료]
// 메시지는 항상 DB의 현재 상태로 다시 그린다 (여러 명에게 간 메시지에서 누가 먼저 눌러도 나머지 버튼은 최신 상태로 갱신)
// 콜백: pl:<taskId>:<step>

const KST = 9 * 3600_000;
const md = (d: Date) => { const k = new Date(new Date(d).getTime() + KST); return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`; };
const hm = (d: Date) => { const k = new Date(new Date(d).getTime() + KST); return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`; };

/** 이 촬영에서 "내 이름으로 예약된" 연동 장비 — 반납 버튼 표시용.
 *  (과장이 담당자여도 다른 사람 장비를 대신 반납하라고 제안하지 않게 본인 예약만. 대리 반납은 웹에서) */
export async function myTaskReservations(user: SessionUser, taskId: string) {
  const list: any[] = await Reservation.find({ relatedTaskId: taskId, status: "booked", reservedBy: user.id })
    .select("resourceId reservedBy").lean();
  if (list.length === 0) return [];
  const res: any[] = await Resource.find({ _id: { $in: list.map((r) => r.resourceId) } }).select("name managerId").lean();
  const byId = new Map(res.map((r) => [String(r._id), r]));
  return list
    .filter((r) => { const rs = byId.get(String(r.resourceId)); return canMarkReturned(user, String(r.reservedBy), rs?.managerId ? String(rs.managerId) : null); })
    .map((r) => ({ id: String(r._id), name: byId.get(String(r.resourceId))?.name ?? "장비" }));
}

/** 진행 메시지 — 제목·일시·단계 진행표 + 다음 단계 버튼 (+ 내 장비 반납 버튼) */
export async function renderPipeline(task: any, user: SessionUser, intro?: string): Promise<{ text: string; buttons: TgButton[][] }> {
  const id = String(task._id);
  const when = task.allDay ? `${md(task.startDate)} 종일` : `${md(task.startDate)} ${hm(task.startDate)}–${hm(task.endDate)}`;
  const steps = task.pipeline?.steps ?? {};
  const flow = STEP_KEYS.map((k) => `${steps[k] ? "✅" : "⬜"} ${STEP_LABEL[k]}`).join(" → ");

  // 마지막으로 처리한 사람
  const lastKey = [...STEP_KEYS].reverse().find((k) => steps[k]);
  let lastLine = "";
  if (lastKey && task.pipeline?.stepBy?.[lastKey]) {
    const by: any = await User.findById(task.pipeline.stepBy[lastKey]).select("name").lean();
    lastLine = `\n마지막 처리: ${STEP_LABEL[lastKey]} — ${esc(by?.name ?? "")}`;
  }
  const next = nextStep(task.pipeline);
  const head = intro ? `${intro}\n\n` : "";
  const text = [
    `${head}📸 <b>${esc(task.title)}</b>`,
    `🕘 ${when}${task.location ? ` · 📍 ${esc(task.location)}` : ""}`,
    "",
    flow + lastLine,
    !task.pipeline?.on ? "\n(촬영 진행 관리가 꺼진 일정이에요)" : !next ? "\n🎉 보고까지 끝! 일정이 완료됐어요." : "",
  ].join("\n");

  const buttons: TgButton[][] = [];
  if (task.pipeline?.on && next) buttons.push([{ text: `✅ ${STEP_LABEL[next]} 완료`, data: `pl:${id}:${next}` }]);
  const mine = await myTaskReservations(user, id);
  if (mine.length) buttons.push([{ text: `📦 장비 반납 (${mine.length}개)`, data: `rc:t${id}:000` }]);
  return { text, buttons };
}

/** pl:<taskId>:<step> */
export async function handlePipelineCallback(p: { user: SessionUser; chatId: string; messageId: number; callbackId: string; data: string }) {
  const [, taskId, step] = p.data.split(":");
  const task: any = await Task.findById(taskId);
  if (!task) { await answerCallback(p.callbackId, "삭제된 일정이에요."); await editTelegramMessage(p.chatId, p.messageId, "⚠ 삭제된 일정입니다."); return; }
  const rerender = async (toast?: string) => {
    await answerCallback(p.callbackId, toast);
    const r = await renderPipeline(task, p.user);
    await editTelegramMessage(p.chatId, p.messageId, r.text, { html: true, buttons: r.buttons });
  };
  if (!task.pipeline?.on || !STEP_KEYS.includes(step as StepKey)) { await rerender("진행 관리가 꺼진 일정이에요."); return; }
  // 이미 누가 처리한 단계(오래된 버튼) — 현재 상태로만 다시 그림
  if (task.pipeline.steps?.[step]) { await rerender(`이미 ${STEP_LABEL[step as StepKey]} 완료됐어요.`); return; }
  if (!canStepPipeline(p.user, task)) { await answerCallback(p.callbackId, "진행 상황을 바꿀 권한이 없어요. (담당자·과장)"); return; }
  const r = await applyPipelineStep(task, step as StepKey, true, p.user, "텔레그램");
  await rerender(r.finished
    ? `보고 완료! 일정 종료${r.equipDone.length ? ` · 장비 ${r.equipDone.length}건 반납` : ""} 👏`
    : `${STEP_LABEL[step as StepKey]} 완료!`);
}
