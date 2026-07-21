import { connectDB } from "@/lib/mongodb";
import { PersonalEvent } from "@/models/PersonalEvent";
import { User } from "@/models/User";
import { requireActiveUser, json } from "@/lib/api";
import { canViewPersonalCalendar } from "@/lib/permissions";

// GET /api/personal-events/busy?from=&to=&users=id1,id2 — 담당자 배정 시 개인일정 충돌 확인
// 업무 시간대(from~to)에 개인일정이 겹치는 후보를 알려줘 "가능/불가능"을 표시하기 위한 용도.
// 개인 캘린더 열람 규칙(canViewPersonalCalendar)을 그대로 적용 — 볼 수 없는 대상은 응답에서 제외.
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const usersParam = url.searchParams.get("users");
  if (!from || !to || !usersParam) return json({ busy: {} });

  const ids = usersParam.split(",").filter((s) => /^[0-9a-fA-F]{24}$/.test(s)).slice(0, 100);
  if (ids.length === 0) return json({ busy: {} });

  await connectDB();
  const targets: any[] = await User.find({ _id: { $in: ids }, status: "active" })
    .select("teamId role").lean();
  // 열람 권한이 있는 대상만 — 나머지는 "알 수 없음"으로 남겨 프론트에서 표시하지 않는다
  const viewableIds = targets
    .filter((t) => canViewPersonalCalendar(user, { id: String(t._id), teamId: t.teamId ? String(t.teamId) : null, role: t.role }))
    .map((t) => t._id);
  if (viewableIds.length === 0) return json({ busy: {} });

  const events: any[] = await PersonalEvent.find({
    userId: { $in: viewableIds },
    startDate: { $lt: new Date(to) },
    endDate: { $gt: new Date(from) },
  }).select("userId title startDate endDate allDay").sort({ startDate: 1 }).lean();

  const busy: Record<string, { title: string; startDate: string; endDate: string; allDay: boolean }[]> = {};
  for (const e of events) {
    const k = String(e.userId);
    (busy[k] ??= []).push({ title: e.title, startDate: e.startDate, endDate: e.endDate, allDay: e.allDay });
  }
  return json({ busy });
}
