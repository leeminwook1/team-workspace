import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import { Directive } from "@/models/Directive";
import { Event } from "@/models/Event";
import { User } from "@/models/User";
import { Team } from "@/models/Team";
import { Reservation } from "@/models/Reservation";
import "@/models/Resource";
import { json } from "@/lib/api";
import { notify } from "@/lib/notify";
import { sendTelegram, telegramEnabled, esc } from "@/lib/telegram";

// 여러 팀의 팀장·부팀장을 한 번의 쿼리로 조회 → teamId별 사용자 id 목록 (N+1 방지)
async function leadersByTeam(teamIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (teamIds.length === 0) return map;
  const leads: any[] = await User.find({
    teamId: { $in: teamIds }, role: { $in: ["leader", "vice_leader"] }, status: "active",
  }).select("_id teamId").lean();
  for (const l of leads) {
    const key = String(l.teamId);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(String(l._id));
  }
  return map;
}

// GET /api/cron/reminders — 오늘(KST) 마감 알림. vercel.json crons가 매일 UTC 0시(KST 9시)에 호출.
// Vercel은 CRON_SECRET 환경변수를 설정하면 Authorization: Bearer로 함께 보낸다.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  } else if (process.env.NODE_ENV === "production") {
    // 프로덕션에서 시크릿 없이 열어두지 않는다 (스팸 알림 방지)
    return json({ error: "CRON_SECRET이 설정되지 않았습니다." }, 401);
  }

  await connectDB();

  // KST 기준 오늘 [start, end)
  const kst = new Date(Date.now() + 9 * 3600_000);
  const start = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000);
  const end = new Date(start.getTime() + 86_400_000);

  // 1) 오늘 마감(종료)인 미완료 업무 → 담당자에게 (텔레그램에는 [완료] 버튼)
  const tasks: any[] = await Task.find({ status: { $ne: "done" }, endDate: { $gte: start, $lt: end } })
    .select("title assignees")
    .lean();
  let taskNotified = 0;
  for (const t of tasks) {
    const ids = (t.assignees ?? []).map(String);
    if (ids.length === 0) continue;
    await notify(ids, {
      type: "due",
      title: "오늘 마감인 업무가 있어요",
      body: t.title,
      link: `/calendar?task=${String(t._id)}`,
    }, { tgButtons: [[{ text: "✔ 완료 처리", data: `done:${String(t._id)}` }]] });
    taskNotified += ids.length;
  }

  // 2) 오늘 마감인 대기(TODO) → 대상 팀 팀장·부팀장에게
  const dirs: any[] = await Directive.find({ status: "todo", dueDate: { $gte: start, $lt: end } })
    .select("title teamId")
    .lean();
  // 팀별 리더를 한 번에 조회해 그룹핑 (지시 건수만큼 쿼리하지 않도록)
  const dirTeamIds = Array.from(new Set(dirs.map((d) => String(d.teamId)).filter(Boolean)));
  const leadsByTeam = await leadersByTeam(dirTeamIds);
  let dirNotified = 0;
  for (const d of dirs) {
    const ids = leadsByTeam.get(String(d.teamId)) ?? [];
    if (ids.length === 0) continue;
    await notify(ids, { type: "due", title: "오늘 마감인 TODO가 있어요", body: d.title, link: "/directives" });
    dirNotified += ids.length;
  }

  // 3) 오늘 마감인 행사 할 일 → 담당자 (없으면 행사 담당자, 그것도 없으면 등록자)
  const events: any[] = await Event.find({ deletedAt: null, closedAt: null, items: { $elemMatch: { dueDate: { $gte: start, $lt: end }, status: { $ne: "done" } } } })
    .select("title items managerId createdBy")
    .lean();
  let eventNotified = 0;
  for (const ev of events) {
    // 수신자별로 할 일 제목을 묶어 1회 알림
    const byUser = new Map<string, string[]>();
    for (const it of ev.items ?? []) {
      if (!it.dueDate || it.status === "done") continue;
      const due = new Date(it.dueDate);
      if (due < start || due >= end) continue;
      const target = it.assigneeId ?? ev.managerId ?? ev.createdBy;
      if (!target) continue;
      const key = String(target);
      if (!byUser.has(key)) byUser.set(key, []);
      byUser.get(key)!.push(it.title);
    }
    for (const [uid, titles] of Array.from(byUser.entries())) {
      await notify([uid], {
        type: "due",
        title: "오늘 마감인 행사 할 일이 있어요",
        body: `${ev.title} — ${titles.slice(0, 3).join(", ")}${titles.length > 3 ? ` 외 ${titles.length - 3}건` : ""}`,
        link: `/events/${String(ev._id)}`,
      });
      eventNotified += 1;
    }
  }

  // 4) 지연 업무 — 마감(종료)이 지났는데 완료가 아닌 업무 (보류 제외, 최근 14일 내 마감분만)
  const lateFloor = new Date(start.getTime() - 14 * 86_400_000);
  const lateTasks: any[] = await Task.find({
    status: { $in: ["todo", "in_progress"] },
    endDate: { $gte: lateFloor, $lt: start },
  })
    .select("title assignees teamIds endDate")
    .sort({ endDate: 1 })
    .lean();

  // 4-1) 담당자에게 — 본인 지연 업무를 묶어 1회 알림
  const lateByUser = new Map<string, string[]>();
  for (const t of lateTasks) {
    for (const uid of (t.assignees ?? []).map(String)) {
      if (!lateByUser.has(uid)) lateByUser.set(uid, []);
      lateByUser.get(uid)!.push(t.title);
    }
  }
  let lateUserNotified = 0;
  for (const [uid, titles] of Array.from(lateByUser.entries())) {
    await notify([uid], {
      type: "due",
      title: `⚠ 마감이 지난 업무가 ${titles.length}건 있어요`,
      body: `${titles.slice(0, 3).join(", ")}${titles.length > 3 ? ` 외 ${titles.length - 3}건` : ""}`,
      link: "/calendar",
    });
    lateUserNotified += 1;
  }

  // 4-2) 팀장·부팀장에게 — 팀 지연 현황 요약 (본인 담당 건은 4-1로 이미 받으므로 제외하지 않고 요약으로 제공)
  const lateByTeam = new Map<string, string[]>();
  for (const t of lateTasks) {
    for (const tid of (t.teamIds ?? []).map(String)) {
      if (!lateByTeam.has(tid)) lateByTeam.set(tid, []);
      lateByTeam.get(tid)!.push(t.title);
    }
  }
  const lateLeadsByTeam = await leadersByTeam(Array.from(lateByTeam.keys()));
  let lateLeadNotified = 0;
  for (const [tid, titles] of Array.from(lateByTeam.entries())) {
    const ids = lateLeadsByTeam.get(tid) ?? [];
    if (ids.length === 0) continue;
    await notify(ids, {
      type: "due",
      title: `⚠ 우리 팀 지연 업무 ${titles.length}건`,
      body: `${titles.slice(0, 3).join(", ")}${titles.length > 3 ? ` 외 ${titles.length - 3}건` : ""}`,
      link: "/team",
    });
    lateLeadNotified += ids.length;
  }

  // 5) 미반납 장비 — 종료가 지났는데 반납 안 된 예약 → 예약자에게 [반납 처리] 버튼과 함께 (최근 7일분)
  const overdueResv: any[] = await Reservation.find({
    status: "booked",
    endAt: { $gte: new Date(start.getTime() - 7 * 86_400_000), $lt: new Date(Date.now() - 10 * 60_000) },
  })
    .populate("resourceId", "name")
    .select("resourceId reservedBy endAt")
    .sort({ endAt: 1 })
    .lean();
  const resvByUser = new Map<string, { name: string; rid: string }[]>();
  for (const r of overdueResv) {
    const uid = String(r.reservedBy);
    if (!resvByUser.has(uid)) resvByUser.set(uid, []);
    resvByUser.get(uid)!.push({ name: r.resourceId?.name ?? "장비", rid: String(r._id) });
  }
  let overdueResvNotified = 0;
  for (const [uid, items] of Array.from(resvByUser.entries())) {
    await notify([uid], {
      type: "reservation",
      title: `📦 미반납 장비가 ${items.length}건 있어요`,
      body: items.slice(0, 5).map((i) => i.name).join(", ") + (items.length > 5 ? ` 외 ${items.length - 5}건` : ""),
      link: "/resources",
    }, { tgButtons: items.slice(0, 5).map((i) => [{ text: `✅ ${i.name} 반납 처리`, data: `ret:${i.rid}` }]) });
    overdueResvNotified += 1;
  }

  // 6) 팀 그룹방 아침 브리핑 — 그룹 챗 ID를 등록한 팀에 오늘 일정·장비 대여 요약
  let briefed = 0;
  if (telegramEnabled()) {
    const teams: any[] = await Team.find({ isActive: true, telegramChatId: { $nin: ["", null] } })
      .select("name telegramChatId")
      .lean();
    const kstDow = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.now() + 9 * 3600_000).getUTCDay()];
    const fmtT = (d: Date) =>
      new Date(d).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
    for (const team of teams) {
      const dayTasks: any[] = await Task.find({
        teamIds: team._id, startDate: { $lt: end }, endDate: { $gt: start },
      }).sort({ allDay: -1, startDate: 1 }).limit(12).select("title allDay startDate status").lean();
      const dayResv: any[] = await Reservation.find({
        teamId: team._id, status: "booked", startAt: { $lt: end }, endAt: { $gt: start },
      }).populate("resourceId", "name").populate("reservedBy", "name").sort({ startAt: 1 }).limit(12).lean();
      if (dayTasks.length === 0 && dayResv.length === 0) continue; // 빈 브리핑은 보내지 않음

      const taskLines = dayTasks.map((t) =>
        `· ${t.allDay ? "종일" : fmtT(t.startDate)} ${esc(t.title)}${t.status === "done" ? " ✔" : ""}`);
      const resvLines = dayResv.map((r) =>
        `· ${esc(r.resourceId?.name ?? "?")} ${fmtT(r.startAt)}~${fmtT(r.endAt)}${r.reservedBy?.name ? ` (${esc(r.reservedBy.name)})` : ""}`);
      const text = [
        `☀️ <b>${esc(team.name)} 오늘 브리핑</b> (${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${kstDow})`,
        dayTasks.length > 0 ? `\n📅 일정 ${dayTasks.length}건\n${taskLines.join("\n")}` : "",
        dayResv.length > 0 ? `\n📦 장비 대여 ${dayResv.length}건\n${resvLines.join("\n")}` : "",
      ].filter(Boolean).join("\n");
      if (await sendTelegram(team.telegramChatId, text, { html: true })) briefed += 1;
    }
  }

  // 7) 소프트 삭제된 행사 완전 삭제 (30일 경과분)
  const purge = await Event.deleteMany({ deletedAt: { $lt: new Date(Date.now() - 30 * 86_400_000) } });

  return json({
    tasksDue: tasks.length, taskNotified, directivesDue: dirs.length, dirNotified,
    eventItemsDue: events.length, eventNotified,
    lateTasks: lateTasks.length, lateUserNotified, lateLeadNotified,
    overdueReservations: overdueResv.length, overdueResvNotified, teamBriefings: briefed,
    purgedEvents: purge.deletedCount,
  });
}
