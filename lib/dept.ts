import { connectDB } from "./mongodb";
import { Team } from "@/models/Team";

// 사진과 전용 — 문화부 시절의 다중 팀 구조를 걷어내고 "과" 하나만 둔다.
// 데이터 모델(teamId·teamIds)은 호환을 위해 유지하되, 값은 항상 이 과의 id로 채운다.
// 화면에서는 팀을 고르거나 보여주지 않는다.

export const DEPT_NAME = "사진과";
export const APP_NAME = "사진과 워크스페이스";

let cached: { id: string; name: string; color: string } | null = null;

/** 사진과(유일한 활성 팀). 없으면 null — 관리자 초기 설정 전 상태 */
export async function getDept() {
  if (cached) return cached;
  await connectDB();
  const t: any = await Team.findOne({ isActive: true }).sort({ createdAt: 1 }).lean();
  if (!t) return null;
  cached = { id: String(t._id), name: t.name, color: t.color };
  return cached;
}

export async function getDeptId(): Promise<string | null> {
  return (await getDept())?.id ?? null;
}
