import { Assignment, Submission } from "@/models/Assignment";
import { User } from "@/models/User";
import { notify } from "./notify";

// 과제 마감 일주일 전 알림 — 마감일이 정확히 7일 뒤인 과제를, 아직 제출하지 않은 과원에게 (출제자 제외)
const DAY = 86_400_000;
const KST = 9 * 3600_000;

export async function sendAssignmentWeekReminders(start: Date, end: Date) {
  const from = new Date(start.getTime() + 7 * DAY);
  const to = new Date(end.getTime() + 7 * DAY);
  const list: any[] = await Assignment.find({
    closed: false, dueDate: { $gte: from, $lt: to }, dueRemindedAt: null,
  }).select("title teamId dueDate createdBy").lean();

  let notified = 0;
  for (const a of list) {
    const members: any[] = await User.find({
      status: "active", teamId: a.teamId, role: { $in: ["leader", "vice_leader", "member"] },
    }).select("_id").lean();
    const done = new Set((await Submission.find({ assignmentId: a._id }).select("userId").lean()).map((s: any) => String(s.userId)));
    const to = members.map((m) => String(m._id)).filter((id) => !done.has(id) && id !== String(a.createdBy));
    const k = new Date(new Date(a.dueDate).getTime() + KST);
    const due = `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${["일", "월", "화", "수", "목", "금", "토"][k.getUTCDay()]})`;
    await notify(to, {
      type: "due",
      title: `📸 과제 마감 일주일 전 — ${a.title}`,
      body: `${due}까지 제출해 주세요.`,
      link: `/assignments/${String(a._id)}`,
    });
    await Assignment.updateOne({ _id: a._id }, { $set: { dueRemindedAt: new Date() } });
    notified += to.length;
  }
  return { assignments: list.length, notified };
}
