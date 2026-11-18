import { Task } from "@/models/Task";
import { Category } from "@/models/Category";
import { Reservation } from "@/models/Reservation";
import "@/models/Resource";
import "@/models/User";
import { notify } from "./notify";

// 촬영 안내 — 촬영(촬영 카테고리 또는 촬영 진행 관리가 켜진 일정)의 담당자에게
// 시간·장소·함께 가는 사람·연동 장비(내가 챙길 장비 포함)를 한 번에 보낸다.
//  · 당일 09시 (매일 크론)
//  · 오전 촬영은 전날 저녁 (30분 크론 — lib/timedNotices) → 다음 날 09시 안내는 건너뜀

const KST = 9 * 3600_000;
const hm = (d: Date) => {
  const k = new Date(new Date(d).getTime() + KST);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
};
const md = (d: Date) => { const k = new Date(new Date(d).getTime() + KST); return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`; };

export async function shootCategoryIds() {
  return (await Category.find({ name: /촬영/ }).select("_id").lean()).map((c: any) => c._id);
}

/** 한 촬영의 담당자들에게 안내 — 보낸 인원 수 */
export async function sendShootBrief(t: any, titlePrefix: string) {
  const people = (t.assignees ?? []).filter((a: any) => a?._id);
  if (people.length === 0) return 0;
  const resv: any[] = await Reservation.find({ relatedTaskId: t._id, status: "booked" })
    .populate("resourceId", "name").select("resourceId reservedBy").lean();

  const multiDay = md(t.startDate) !== md(t.endDate);
  const when = t.allDay
    ? (multiDay ? `종일 · ${md(t.startDate)}~${md(t.endDate)}` : "종일")
    : `${titlePrefix.includes("내일") ? `${md(t.startDate)} ` : ""}${hm(t.startDate)}–${multiDay ? `${md(t.endDate)} ` : ""}${hm(t.endDate)}`;
  const names = people.map((a: any) => a.name).join(", ");
  const equip = resv.map((r) => r.resourceId?.name).filter(Boolean);

  for (const a of people) {
    const uid = String(a._id);
    const mine = resv.filter((r) => String(r.reservedBy) === uid).map((r) => r.resourceId?.name).filter(Boolean);
    const lines = [
      `🕘 ${when}${t.location ? ` · 📍 ${t.location}` : ""}`,
      `👥 ${names}`,
      equip.length ? `📦 장비: ${equip.join(", ")}` : "📦 연동된 장비 없음",
      mine.length ? `🎒 내가 챙길 장비: ${mine.join(", ")}` : "",
    ].filter(Boolean);
    await notify([uid], {
      type: "shoot",
      title: `${titlePrefix} — ${t.title}`,
      body: lines.join("\n"),
      link: `/calendar?task=${String(t._id)}`,
    });
  }
  return people.length;
}

/** [start, end) = KST 오늘. 알림 대상 일정 id 목록을 돌려준다 (다른 "오늘 마감" 알림과 중복 방지용 —
 *  전날 저녁에 이미 안내한 일정도 포함해서 돌려줘 오늘 마감 알림이 따로 가지 않게) */
export async function sendShootBriefs(start: Date, end: Date) {
  const shootCats = await shootCategoryIds();
  const tasks: any[] = await Task.find({
    startDate: { $gte: start, $lt: end },
    status: { $ne: "done" },
    $or: [{ categoryId: { $in: shootCats } }, { "pipeline.on": true }],
  }).populate("assignees", "name").select("title startDate endDate allDay location assignees pipeline notice").lean();

  const sent: string[] = [];
  let notified = 0;
  for (const t of tasks) {
    if ((t.assignees ?? []).filter((a: any) => a?._id).length === 0) continue;
    sent.push(String(t._id));
    if (t.notice?.eveAt) continue; // 전날 저녁에 이미 안내함
    notified += await sendShootBrief(t, "📸 오늘 촬영");
  }
  return { tasks: sent, notified };
}
