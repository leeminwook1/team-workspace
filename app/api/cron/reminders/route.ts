import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import { Directive } from "@/models/Directive";
import { Event } from "@/models/Event";
import { User } from "@/models/User";
import { json } from "@/lib/api";
import { notify } from "@/lib/notify";

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

  // 1) 오늘 마감(종료)인 미완료 업무 → 담당자에게
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
    });
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

  // 5) 소프트 삭제된 행사 완전 삭제 (30일 경과분)
  const purge = await Event.deleteMany({ deletedAt: { $lt: new Date(Date.now() - 30 * 86_400_000) } });

  return json({
    tasksDue: tasks.length, taskNotified, directivesDue: dirs.length, dirNotified,
    eventItemsDue: events.length, eventNotified,
    lateTasks: lateTasks.length, lateUserNotified, lateLeadNotified,
    purgedEvents: purge.deletedCount,
  });
}
