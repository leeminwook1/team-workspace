import { Task } from "@/models/Task";
import { User } from "@/models/User";
import { Reservation } from "@/models/Reservation";
import "@/models/Resource";
import { sendTelegram, telegramEnabled, esc } from "./telegram";
import { shootCategoryIds, sendShootBrief } from "./shootBrief";
import { taskWindow } from "./taskReservations";
import { renderPipeline, myTaskReservations } from "./tgPipeline";
import { renderChecklist } from "./tgReturn";
import type { SessionUser, Role } from "./permissions";
import { eveValid, wrapValid } from "./noticeMarks";

// 시간 맞춤 알림 — 30분마다 (GitHub Actions → /api/cron/frequent). 늦게·여러 번 불려도 안전하게
// "보낼 때가 됐고 + 아직 안 보낸(표시 없음)" 것만 보내고, 보낸 표시(task.notice)를 남긴다.
//  1) 오전 촬영 전날 저녁 안내 — 19~22시(KST) 사이 실행 시, 내일 10시 전에 시작하는 시간 지정 촬영
//  2) 촬영 끝난 뒤 — 종료 30분 지나면 담당자에게 [촬영 완료]→… 진행 버튼, 내 장비가 있으면 [장비 반납]

const KST = 9 * 3600_000;
const DAY = 86_400_000;

function kstMidnight(now: Date, plusDays = 0) {
  const k = new Date(now.getTime() + KST);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + plusDays) - KST);
}

/** 1) 전날 저녁 안내 — 보낸 촬영 수 */
export async function sendEveningBriefs(now = new Date()) {
  const hour = new Date(now.getTime() + KST).getUTCHours();
  if (hour < 19 || hour > 22) return 0;
  const tStart = kstMidnight(now, 1);
  const early = new Date(tStart.getTime() + 10 * 3600_000); // 내일 10:00 전 시작
  const cats = await shootCategoryIds();
  const tasks: any[] = await Task.find({
    allDay: false, // 종일 일정은 UTC 자정(=09시 KST) 저장이라 "이른 촬영"으로 오인하지 않게 제외
    startDate: { $gte: tStart, $lt: early },
    status: { $ne: "done" },
    $or: [{ categoryId: { $in: cats } }, { "pipeline.on": true }],
  }).populate("assignees", "name").select("title startDate endDate allDay location assignees notice").lean();

  let count = 0;
  for (const t of tasks) {
    if (eveValid(t.notice?.eveAt, t.startDate)) continue; // 지금 시작 시각 기준으로 이미 보냄 (시간이 바뀌었으면 다시)
    if ((t.assignees ?? []).filter((a: any) => a?._id).length === 0) continue; // 담당자 없으면 표시도 안 함 (나중에 지정되면 보냄)
    // 읽은 표시 값 그대로일 때만 새로 표시 — 동시에 두 번 불려도 한 번만 보낸다
    const prev = t.notice?.eveAt ?? null;
    const claim = await Task.updateOne({ _id: t._id, "notice.eveAt": prev }, { $set: { "notice.eveAt": new Date() } });
    if (claim.modifiedCount === 0) continue;
    await sendShootBrief(t, "🌙 내일 아침 촬영");
    count += 1;
  }
  return count;
}

/** 2) 촬영 끝난 뒤 진행·반납 버튼 — 보낸 촬영 수 */
export async function sendWrapPrompts(now = new Date()) {
  if (!telegramEnabled()) return 0;
  const cats = await shootCategoryIds();
  // 넓게 가져와서 실제 종료 시각(종일은 그날 자정까지)으로 거른다
  const tasks: any[] = await Task.find({
    endDate: { $gte: new Date(now.getTime() - 3 * DAY), $lt: now },
    status: { $ne: "done" },
    $or: [{ categoryId: { $in: cats } }, { "pipeline.on": true }],
  }).select("title startDate endDate allDay location assignees createdBy pipeline notice").lean();

  let count = 0;
  for (const t of tasks) {
    const end = taskWindow({ startDate: new Date(t.startDate), endDate: new Date(t.endDate), allDay: !!t.allDay }).endAt;
    if (wrapValid(t.notice?.wrapAt, end)) continue; // 지금 종료 시각 기준으로 이미 보냄 (종료가 늦춰졌으면 다시)
    if (end.getTime() > now.getTime() - 30 * 60_000) continue; // 끝나고 30분 지나서
    const prev = t.notice?.wrapAt ?? null;
    if (end.getTime() < now.getTime() - 2 * DAY) {
      // 너무 지난 건 조용히 표시만 (배포 직후 과거 촬영에 한꺼번에 가지 않게)
      await Task.updateOne({ _id: t._id, "notice.wrapAt": prev }, { $set: { "notice.wrapAt": now } });
      continue;
    }
    const claim = await Task.updateOne({ _id: t._id, "notice.wrapAt": prev }, { $set: { "notice.wrapAt": new Date() } });
    if (claim.modifiedCount === 0) continue;

    const pipelineNeeded = t.pipeline?.on && !t.pipeline?.steps?.shoot;
    const assignees = (t.assignees ?? []).map(String);
    // 진행 버튼 → 담당자(없으면 등록자) / 반납 → 연동 장비를 예약한 사람
    const resv: any[] = await Reservation.find({ relatedTaskId: t._id, status: "booked" }).select("reservedBy").lean();
    const reservers = resv.map((r) => String(r.reservedBy));
    const to = Array.from(new Set([...(pipelineNeeded ? (assignees.length ? assignees : [String(t.createdBy)]) : []), ...reservers])).filter(Boolean);
    if (to.length === 0) continue;

    const users: any[] = await User.find({ _id: { $in: to }, status: "active", telegramChatId: { $nin: ["", null] } })
      .select("name role teamId status telegramChatId").lean();
    for (const u of users) {
      const su: SessionUser = { id: String(u._id), name: u.name, role: (u.role ?? "member") as Role, teamId: u.teamId ? String(u.teamId) : null, status: u.status };
      if (pipelineNeeded) {
        const r = await renderPipeline(t, su, "📸 <b>촬영 끝났나요?</b> 진행 상황을 버튼으로 눌러주세요.");
        await sendTelegram(u.telegramChatId, r.text, { html: true, buttons: r.buttons });
      } else {
        const mine = await myTaskReservations(su, String(t._id));
        if (mine.length === 0) continue;
        const r = renderChecklist(`t${String(t._id)}`, "000", mine);
        await sendTelegram(u.telegramChatId, `📸 <b>${esc(t.title)}</b> 촬영이 끝났어요. 장비를 반납해주세요.\n\n${r.text}`, { html: true, buttons: r.buttons });
      }
    }
    count += 1;
  }
  return count;
}
