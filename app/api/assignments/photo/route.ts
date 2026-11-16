import { get } from "@vercel/blob";
import { connectDB } from "@/lib/mongodb";
import { Assignment, Submission } from "@/models/Assignment";
import { requireActiveUser, json } from "@/lib/api";
import { canViewAssignment } from "@/lib/permissions";
import { blobEnabled, ownPrefix, PHOTO_PREFIX } from "@/lib/assignmentPhotos";

// GET /api/assignments/photo?p=<pathname> — private 사진 스트리밍
// 허용: 본인 업로드분(저장 전 미리보기) 또는 그 사진이 속한 과제의 팀을 볼 수 있는 사람
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!blobEnabled()) return json({ error: "저장소 미연결" }, 503);

  const p = new URL(req.url).searchParams.get("p") ?? "";
  if (!p.startsWith(PHOTO_PREFIX) || p.includes("..")) return json({ error: "잘못된 요청입니다." }, 400);

  if (!p.startsWith(ownPrefix(user.id))) {
    await connectDB();
    let teamId: string | null = null;
    const a: any = await Assignment.findOne({ "references.pathname": p }).select("teamId").lean();
    if (a) teamId = String(a.teamId);
    else {
      const s: any = await Submission.findOne({ "photos.pathname": p }).select("assignmentId").lean();
      if (s) {
        const sa: any = await Assignment.findById(s.assignmentId).select("teamId").lean();
        if (sa) teamId = String(sa.teamId);
      }
    }
    if (!teamId || !canViewAssignment(user, teamId)) return json({ error: "사진을 볼 권한이 없습니다." }, 404);
  }

  const result = await get(p, { access: "private" });
  if (!result || result.statusCode !== 200) return json({ error: "사진을 찾을 수 없습니다." }, 404);

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType ?? "image/jpeg",
      // pathname은 업로드마다 고유(덮어쓰기 없음) → 브라우저에 오래 캐시해도 안전, 공유 캐시는 금지
      "Cache-Control": "private, max-age=604800, immutable",
    },
  });
}
