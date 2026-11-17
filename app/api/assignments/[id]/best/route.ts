import { connectDB } from "@/lib/mongodb";
import { Assignment, Submission } from "@/models/Assignment";
import { requireActiveUser, json, badId } from "@/lib/api";
import { canManageAssignments } from "@/lib/permissions";
import { notify } from "@/lib/notify";
import { touchChanged } from "@/lib/changes";

// POST /api/assignments/:id/best — 베스트 컷 선정/해제 (과장·부과장·admin). body: { pathname, best }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  { const bad = badId(params.id); if (bad) return bad; }
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const pathname = typeof body?.pathname === "string" ? body.pathname : "";
  const best = body?.best !== false;
  if (!pathname) return json({ error: "사진을 지정해주세요." }, 400);

  await connectDB();
  const a: any = await Assignment.findById(params.id).select("teamId title").lean();
  if (!a) return json({ error: "과제를 찾을 수 없습니다." }, 404);
  if (!canManageAssignments(user, String(a.teamId))) return json({ error: "베스트 컷은 과장·부과장이 선정해요." }, 403);

  const s: any = await Submission.findOne({ assignmentId: a._id, "photos.pathname": pathname });
  if (!s) return json({ error: "제출된 사진이 아닙니다." }, 404);
  const photo = s.photos.find((p: any) => p.pathname === pathname);
  const was = !!photo.best;
  photo.best = best;
  s.markModified("photos");
  await s.save();
  await touchChanged("assignment");

  if (best && !was && String(s.userId) !== user.id) {
    await notify([String(s.userId)], {
      type: "assignment",
      title: "🏆 베스트 컷에 선정됐어요",
      body: `${a.title}${photo.caption ? ` — ${photo.caption}` : ""}`,
      link: `/assignments/${String(a._id)}`,
    });
  }
  return json({ best });
}
