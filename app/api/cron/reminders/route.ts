import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import { Directive } from "@/models/Directive";
import { User } from "@/models/User";
import { json } from "@/lib/api";
import { notify } from "@/lib/notify";

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

  // 2) 오늘 마감인 대기(TODO) 지시 → 대상 팀 팀장·부팀장에게
  const dirs: any[] = await Directive.find({ status: "todo", dueDate: { $gte: start, $lt: end } })
    .select("title teamId")
    .lean();
  let dirNotified = 0;
  for (const d of dirs) {
    if (!d.teamId) continue;
    const leads: any[] = await User.find({
      teamId: d.teamId, role: { $in: ["leader", "vice_leader"] }, status: "active",
    }).select("_id").lean();
    const ids = leads.map((l) => String(l._id));
    if (ids.length === 0) continue;
    await notify(ids, { type: "due", title: "오늘 마감인 TODO 지시가 있어요", body: d.title, link: "/directives" });
    dirNotified += ids.length;
  }

  return json({ tasksDue: tasks.length, taskNotified, directivesDue: dirs.length, dirNotified });
}
