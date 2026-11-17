import { connectDB } from "@/lib/mongodb";
import { Event } from "@/models/Event";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canViewPersonalCalendar } from "@/lib/permissions";

// GET /api/events/mine?from=&to=&user= — 내 캘린더용 행사 오버레이 (읽기 전용)
//  · 포지션에 배정된 행사 → 행사일에 "🎯 행사명 · 포지션"
//  · 행사 할 일 담당 → 마감일에 "✅ 할 일 — 행사명"
// user 지정 시 개인 캘린더 열람 권한(과장 등) 확인
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  const url = new URL(req.url);
  const from = new Date(url.searchParams.get("from") ?? "");
  const to = new Date(url.searchParams.get("to") ?? "");
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return json({ error: "기간을 지정해주세요." }, 400);
  const owner = url.searchParams.get("user") || user.id;

  await connectDB();
  if (owner !== user.id) {
    const target: any = await User.findById(owner).select("teamId status role").lean();
    if (!target || target.status !== "active") return json({ error: "사용자를 찾을 수 없습니다." }, 404);
    if (!canViewPersonalCalendar(user, { id: owner, teamId: target.teamId ? String(target.teamId) : null, role: target.role })) {
      return json({ error: "이 사용자의 개인 캘린더를 볼 권한이 없습니다." }, 403);
    }
  }

  const evs: any[] = await Event.find({
    deletedAt: null,
    $or: [
      { "positions.userIds": owner, eventDate: { $gte: from, $lt: to } },
      { items: { $elemMatch: { assigneeId: owner, dueDate: { $gte: from, $lt: to } } } },
    ],
  }).select("title eventDate meetTime location positions items closedAt").lean();

  const out: any[] = [];
  for (const e of evs) {
    const spots = (e.positions ?? []).filter((p: any) => (p.userIds ?? []).some((u: any) => String(u) === owner)).map((p: any) => p.name);
    const d = e.eventDate ? new Date(e.eventDate) : null;
    if (spots.length && d && d >= from && d < to) {
      out.push({
        id: `ev:${String(e._id)}`, kind: "position",
        title: `🎯 ${e.title} · ${spots.join(", ")}${e.meetTime ? ` (집합 ${e.meetTime})` : ""}`,
        startDate: d, endDate: d, allDay: true, status: e.closedAt ? "done" : "todo",
        location: e.location ?? "", href: `/events/${String(e._id)}`,
      });
    }
    for (const it of e.items ?? []) {
      if (String(it.assigneeId ?? "") !== owner || !it.dueDate) continue;
      const due = new Date(it.dueDate);
      if (due < from || due >= to) continue;
      out.push({
        id: `evi:${String(it._id)}`, kind: "item",
        title: `✅ ${it.title} — ${e.title}`,
        startDate: due, endDate: due, allDay: true, status: it.status === "done" ? "done" : "todo",
        location: "", href: `/events/${String(e._id)}`,
      });
    }
  }
  return json({ items: out });
}
