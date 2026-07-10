import { connectDB } from "@/lib/mongodb";
import { Event } from "@/models/Event";
import { requireActiveUser, json } from "@/lib/api";
import { canManageEvents } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

// POST /api/events/:id/duplicate — 행사 복제 (템플릿 재사용)
// 필드·투두 목록을 복사하되, 투두 상태는 '할 일'로 초기화하고 담당자·마감·행사일은 비운다.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!canManageEvents(user)) return json({ error: "행사를 복제할 권한이 없습니다." }, 403);

  await connectDB();
  const src: any = await Event.findById(params.id).lean();
  if (!src) return json({ error: "행사를 찾을 수 없습니다." }, 404);

  const title = `${src.title} (복사)`;
  const items = (src.items ?? []).map((it: any) => ({
    title: it.title,
    status: "todo", // 진행 상태 초기화
    teamId: it.teamId ?? null, // 팀 태깅은 유지(템플릿 가치)
    assigneeId: null, // 담당자 비움
    dueDate: null, // 마감 비움
    note: it.note ?? "",
  }));

  const created = await Event.create({
    title,
    description: src.description ?? "",
    teamIds: src.teamIds ?? [],
    managerId: src.managerId ?? null,
    eventDate: null, // 새 행사일은 사용자가 지정
    location: src.location ?? "",
    priority: src.priority ?? "normal",
    items,
    createdBy: user.id, // 복제한 사람이 소유자
  });

  await logActivity({ actorId: user.id, actorName: user.name, action: "create", targetType: "event", targetTitle: created.title });
  return json({ id: String(created._id) }, 201);
}
