import { connectDB } from "@/lib/mongodb";
import { requireActiveUser, json, limitWrites } from "@/lib/api";
import { findSimilarTasks } from "@/lib/similarTasks";

// GET /api/tasks/similar?title=&from=&to= — 등록 전 중복(유사 일정) 감지.
// 의도적으로 팀 범위를 넘어 전체를 검색한다 — 다른 팀이 이미 등록한 같은 행사를 찾는 게 목적.
// 노출 정보는 제목·기간·팀뿐이라 개인 캘린더 규칙과 무관.
export async function GET(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  // 전체 일정 제목 스크래핑 방지 — 프런트는 400ms 디바운스라 정상 사용엔 충분히 넉넉
  const limited = await limitWrites(`similar:${user.id}`, 40, 60_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const title = url.searchParams.get("title") ?? "";
  const from = new Date(url.searchParams.get("from") ?? "");
  const to = new Date(url.searchParams.get("to") ?? "");
  // 최소 2자 — 짧은 질의로 광범위 스캔·열거하는 것 차단
  if (title.trim().length < 2 || isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) {
    return json({ similar: [] });
  }

  await connectDB();
  const similar = await findSimilarTasks(title, from, to);
  return json({ similar });
}
