import crypto from "crypto";
import { put } from "@vercel/blob";
import { User } from "@/models/User";
import { Assignment, Submission } from "@/models/Assignment";
import { esc, answerCallback, editTelegramMessage, downloadTelegramFile, type TgButton } from "./telegram";
import { canSubmitAssignment, type SessionUser } from "./permissions";
import { blobEnabled, ownPrefix, MAX_PHOTOS } from "./assignmentPhotos";
import { notify } from "./notify";
import { touchChanged } from "./changes";
import { getDraft, clearDraft } from "./tgDraft";
import type { TgReply } from "./telegramCommands";

// 사진 보내면 과제 제출 — 1:1 대화방에 사진(앨범 가능)을 보내면 [과제 선택] 버튼 → 내 제출물에 사진 추가
// 앨범은 사진마다 따로 업데이트가 오므로 같은 묶음(media_group_id)은 원자적으로 모으고, 첫 장에서만 버튼을 보낸다.
// 콜백: asg:<assignmentId> 제출 / asg:x 취소

type PhotoMsg = { message_id: number; media_group_id?: string; caption?: string; photo: { file_id: string; file_unique_id: string }[] };

export async function handlePhoto(user: SessionUser, msg: PhotoMsg): Promise<TgReply> {
  const best = msg.photo[msg.photo.length - 1]; // 가장 큰 해상도
  const file = { id: best.file_id, uid: best.file_unique_id };
  const group = msg.media_group_id ?? `single:${msg.message_id}`;
  const now = new Date();

  // 이 묶음의 첫 사진이면 새 대기 상태로 (원자적) — 아니면 사진만 추가 (같은 사진 재전송은 중복 제거)
  const first = await User.findOneAndUpdate(
    { _id: user.id, $or: [{ tgDraft: null }, { "tgDraft.group": { $ne: group } }] },
    { $set: { tgDraft: { kind: "photo", group, files: [file], caption: (msg.caption ?? "").slice(0, 500), at: now } } },
  ).select("_id").lean();
  if (!first) {
    await User.updateOne({ _id: user.id, "tgDraft.group": group }, {
      $addToSet: { "tgDraft.files": file },
      ...(msg.caption ? { $set: { "tgDraft.caption": msg.caption.slice(0, 500) } } : {}),
    });
    return ""; // 같은 앨범의 나머지 사진 — 답장 안 함
  }

  if (!blobEnabled()) { await clearDraft(user.id); return "❌ 사진 저장소가 아직 연결되지 않았어요. 관리자에게 문의해주세요."; }
  const open: any[] = user.teamId
    ? await Assignment.find({ teamId: user.teamId, closed: false }).select("title dueDate teamId").sort({ createdAt: -1 }).limit(4).lean()
    : [];
  const list = open.filter((a) => canSubmitAssignment(user, String(a.teamId)));
  if (list.length === 0) {
    await clearDraft(user.id);
    return "📸 사진을 받았는데, 지금 제출할 수 있는 과제가 없어요.\n(사진은 과제 제출에만 쓰여요)";
  }
  const md = (d: Date) => { const k = new Date(new Date(d).getTime() + 9 * 3600_000); return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`; };
  const buttons: TgButton[][] = list.map((a) => [{
    text: `📸 ${a.title.length > 22 ? a.title.slice(0, 22) + "…" : a.title}${a.dueDate ? ` (~${md(a.dueDate)})` : ""}`,
    data: `asg:${String(a._id)}`,
  }]);
  buttons.push([{ text: "취소", data: "asg:x" }]);
  return {
    text: `📸 <b>사진을 과제로 제출할까요?</b>\n앨범으로 보냈다면 모두 모아서 제출돼요. 설명을 적었다면 제출 메모로 들어가요.\n\n제출할 과제를 골라주세요.`,
    html: true,
    buttons,
  };
}

/** asg:<assignmentId> | asg:x */
export async function handleAssignmentCallback(p: { user: SessionUser; chatId: string; messageId: number; callbackId: string; data: string }) {
  const id = p.data.split(":")[1];
  if (id === "x") {
    await clearDraft(p.user.id);
    await answerCallback(p.callbackId);
    await editTelegramMessage(p.chatId, p.messageId, "↩ 제출하지 않았어요.");
    return;
  }
  const draft = await getDraft(p.user.id);
  if (!draft || draft.kind !== "photo" || draft.files.length === 0) {
    await answerCallback(p.callbackId, "시간이 지나 대기가 끝났어요. 사진을 다시 보내주세요.");
    await editTelegramMessage(p.chatId, p.messageId, "⌛ 제출 대기 시간이 지났어요. 사진을 다시 보내주세요.");
    return;
  }
  // 다운로드·업로드가 오래 걸리므로 먼저 응답 (텔레그램 버튼 로딩 표시 해제)
  await answerCallback(p.callbackId, "제출 중…");
  await clearDraft(p.user.id); // 두 번 눌러도 한 번만

  const a: any = await Assignment.findById(id).select("title teamId closed createdBy").lean();
  const fail = (t: string) => editTelegramMessage(p.chatId, p.messageId, t);
  if (!a) { await fail("❌ 과제를 찾을 수 없어요."); return; }
  if (!canSubmitAssignment(p.user, String(a.teamId))) { await fail("❌ 이 과제에 제출할 권한이 없어요."); return; }
  if (a.closed) { await fail("❌ 마감된 과제라 제출할 수 없어요."); return; }

  const existing: any = await Submission.findOne({ assignmentId: a._id, userId: p.user.id });
  const have = existing?.photos?.length ?? 0;
  const room = MAX_PHOTOS - have;
  if (room <= 0) { await fail(`❌ 이미 ${MAX_PHOTOS}장을 제출해서 더 올릴 수 없어요. 웹에서 정리해주세요.`); return; }

  // 같은 사진(file_unique_id) 중복 제거 + 남은 자리만큼
  const seen = new Set<string>();
  const files = draft.files.filter((f) => !seen.has(f.uid) && seen.add(f.uid)).slice(0, room);
  const added: { pathname: string; caption: string; best: boolean }[] = [];
  for (const f of files) {
    const got = await downloadTelegramFile(f.id);
    if (!got) continue;
    const ext = /\.png$/i.test(got.path) ? "png" : /\.webp$/i.test(got.path) ? "webp" : "jpg";
    const pathname = `${ownPrefix(p.user.id)}${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    try {
      await put(pathname, got.data, { access: "private", contentType: ext === "jpg" ? "image/jpeg" : `image/${ext}`, addRandomSuffix: false } as any);
      added.push({ pathname, caption: "", best: false });
    } catch (e) {
      console.error("[telegram photo] 업로드 실패:", (e as Error)?.message);
    }
  }
  if (added.length === 0) { await fail("❌ 사진을 저장하지 못했어요. 잠시 후 다시 보내주세요."); return; }

  const isFirst = !existing;
  if (existing) {
    existing.photos = [...existing.photos, ...added];
    if (!existing.note && draft.caption) existing.note = draft.caption.slice(0, 2000);
    await existing.save();
  } else {
    await Submission.create({ assignmentId: a._id, userId: p.user.id, photos: added, note: draft.caption?.slice(0, 2000) ?? "" });
  }
  await touchChanged("assignment");
  if (isFirst && String(a.createdBy) !== p.user.id) {
    await notify([String(a.createdBy)], {
      type: "assignment",
      title: "📸 과제가 제출됐어요",
      body: `${a.title} — ${p.user.name ?? ""} 님 (${added.length}장, 텔레그램)`,
      link: `/assignments/${String(a._id)}`,
    });
  }
  const skipped = draft.files.length - added.length;
  await editTelegramMessage(p.chatId, p.messageId,
    `✅ <b>${esc(a.title)}</b>에 ${added.length}장 제출했어요 (총 ${have + added.length}장)${skipped > 0 ? `\n⚠ ${skipped}장은 올리지 못했어요 (최대 ${MAX_PHOTOS}장·중복·다운로드 실패)` : ""}\n수정·삭제는 웹 과제 화면에서 할 수 있어요.`,
    { html: true });
}
