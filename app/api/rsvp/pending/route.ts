import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import { requireActiveUser, json } from "@/lib/api";

// GET /api/rsvp/pending — 내가 아직 답하지 않은 모임 (앞으로 열리는 것만, 가까운 순)
export async function GET() {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  await connectDB();
  const list: any[] = await Task.find({
    "rsvp.on": true,
    "rsvp.targets": user.id,
    "rsvp.responses.userId": { $ne: user.id },
    endDate: { $gte: new Date() },
  }).select("title startDate endDate allDay location rsvp.deadline").sort({ startDate: 1 }).limit(10).lean();
  return json({
    items: list.map((t) => ({
      id: String(t._id), title: t.title, startDate: t.startDate, endDate: t.endDate, allDay: t.allDay,
      location: t.location ?? "", deadline: t.rsvp?.deadline ?? null,
    })),
  });
}
