import { Event } from "@/models/Event";
import "@/models/User";
import { notify } from "./notify";

// 행사 당일 아침 알림 — 포지션에 배정된 사람에게 내 포지션·집합·촬영 주의·복장을 보낸다.
// 같은 자리의 동료와 전체 배치도 함께 (현장에서 누가 어디 있는지 바로 확인).

const meetLabel = (t: string) => {
  if (!/^\d{2}:\d{2}$/.test(t)) return "";
  const h = Number(t.slice(0, 2));
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${t.slice(3)}`;
};

export async function sendEventDayBriefs(start: Date, end: Date) {
  const evs: any[] = await Event.find({
    deletedAt: null, closedAt: null, eventDate: { $gte: start, $lt: end }, "positions.0": { $exists: true },
  }).populate("positions.userIds", "name").lean();

  let notified = 0;
  for (const e of evs) {
    const people = new Map<string, string[]>(); // userId → 포지션 이름들
    for (const p of e.positions ?? []) for (const u of p.userIds ?? []) {
      if (!u?._id) continue;
      const id = String(u._id);
      if (!people.has(id)) people.set(id, []);
      people.get(id)!.push(p.name);
    }
    const layout = (e.positions ?? [])
      .map((p: any) => `${p.name} ${(p.userIds ?? []).filter((u: any) => u?.name).map((u: any) => u.name).join("·") || "-"}`)
      .join(" / ");
    const meet = [meetLabel(e.meetTime ?? ""), e.meetPlace].filter(Boolean).join(" · ");

    for (const [uid, spots] of Array.from(people.entries())) {
      const mine = (e.positions ?? []).filter((p: any) => spots.includes(p.name));
      const notes = mine.map((p: any) => p.note).filter(Boolean);
      const mates = mine.flatMap((p: any) => (p.userIds ?? []).filter((u: any) => u?._id && String(u._id) !== uid).map((u: any) => u.name));
      const lines = [
        `📍 내 포지션: ${spots.join(", ")}${notes.length ? ` — ${notes.join(" / ")}` : ""}`,
        mates.length ? `👥 같은 자리: ${Array.from(new Set(mates)).join(", ")}` : "",
        meet ? `⏰ 집합: ${meet}` : "",
        e.location ? `🏛 장소: ${e.location}` : "",
        e.brief?.caution ? `⚠️ 촬영 주의: ${e.brief.caution}` : "",
        e.brief?.dress ? `👔 복장: ${e.brief.dress}` : "",
        `🗺 전체 배치: ${layout}`,
      ].filter(Boolean);
      await notify([uid], {
        type: "shoot",
        title: `🎯 오늘 행사 — ${e.title}`,
        body: lines.join("\n"),
        link: `/events/${String(e._id)}`,
      });
      notified += 1;
    }
  }
  return { events: evs.length, notified };
}
