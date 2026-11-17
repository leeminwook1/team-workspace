import { Task } from "@/models/Task";
import { Category } from "@/models/Category";
import { Reservation } from "@/models/Reservation";
import "@/models/Resource";
import "@/models/User";
import { notify } from "./notify";

// 촬영 당일 아침 알림 — 오늘 시작하는 촬영(촬영 카테고리 또는 촬영 진행 관리가 켜진 일정)의
// 담당자에게 시간·장소·함께 가는 사람·연동 장비(내가 챙길 장비 포함)를 한 번에 보낸다.

const KST = 9 * 3600_000;
const hm = (d: Date) => {
  const k = new Date(new Date(d).getTime() + KST);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
};
const md = (d: Date) => { const k = new Date(new Date(d).getTime() + KST); return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`; };

/** [start, end) = KST 오늘. 알림을 보낸 일정 id 목록을 돌려준다 (다른 "오늘 마감" 알림과 중복 방지용) */
export async function sendShootBriefs(start: Date, end: Date) {
  const shootCats = (await Category.find({ name: /촬영/ }).select("_id").lean()).map((c: any) => c._id);
  const tasks: any[] = await Task.find({
    startDate: { $gte: start, $lt: end },
    status: { $ne: "done" },
    $or: [{ categoryId: { $in: shootCats } }, { "pipeline.on": true }],
  }).populate("assignees", "name").select("title startDate endDate allDay location assignees pipeline").lean();

  const sent: string[] = [];
  let notified = 0;
  for (const t of tasks) {
    const people = (t.assignees ?? []).filter((a: any) => a?._id);
    if (people.length === 0) continue;
    const resv: any[] = await Reservation.find({ relatedTaskId: t._id, status: "booked" })
      .populate("resourceId", "name").select("resourceId reservedBy").lean();

    const multiDay = md(t.startDate) !== md(t.endDate);
    const when = t.allDay
      ? (multiDay ? `종일 · ${md(t.startDate)}~${md(t.endDate)}` : "종일")
      : `${hm(t.startDate)}–${multiDay ? `${md(t.endDate)} ` : ""}${hm(t.endDate)}`;
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
        title: `📸 오늘 촬영 — ${t.title}`,
        body: lines.join("\n"),
        link: `/calendar?task=${String(t._id)}`,
      });
      notified += 1;
    }
    sent.push(String(t._id));
  }
  return { tasks: sent, notified };
}
