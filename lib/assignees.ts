import { User } from "@/models/User";

// 담당자 후보를 "관여 팀의 활성 소속자"만 남기도록 필터한다.
// 임의 userId·타 팀 사용자 주입(알림/텔레그램 스팸)을 차단 — join 라우트와 동일한 정책.
// candidates 중 유효한 것만, 입력 순서를 보존해 반환한다.
export async function filterValidAssignees(candidates: string[], teamIds: string[]): Promise<string[]> {
  const want = Array.from(new Set((candidates ?? []).map(String))).filter(Boolean);
  if (want.length === 0) return [];
  const teams = Array.from(new Set((teamIds ?? []).map(String))).filter(Boolean);
  if (teams.length === 0) return [];
  const valid: any[] = await User.find({
    _id: { $in: want },
    status: "active",
    teamId: { $in: teams },
  })
    .select("_id")
    .lean();
  const ok = new Set(valid.map((u) => String(u._id)));
  return want.filter((id) => ok.has(id));
}
