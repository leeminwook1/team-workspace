import { User } from "@/models/User";

// 텔레그램 대화 중 임시 상태 — 사용자 문서의 tgDraft 하나만 쓴다 (새로 만들면 이전 것은 덮어씀)
//  text  : "그냥 쓰기" 문장 — [개인 일정]/[촬영]/[일정] 버튼을 기다리는 중
//  photo : 과제 제출할 사진 묶음 — [과제 선택] 버튼을 기다리는 중 (앨범은 여러 업데이트로 나눠 옴)
//  issue : 반납 체크리스트에서 "이상 있음" — 어떤 문제인지 다음 메시지로 받는 중
export const DRAFT_TTL = 30 * 60_000;

export type Draft =
  | { kind: "text"; text: string; at: Date }
  | { kind: "photo"; group: string; files: { id: string; uid: string }[]; caption: string; at: Date }
  | { kind: "issue"; target: string; bits: string; at: Date };

export async function getDraft(userId: string): Promise<Draft | null> {
  const u: any = await User.findById(userId).select("tgDraft").lean();
  const d = u?.tgDraft;
  if (!d?.kind || !d.at || Date.now() - new Date(d.at).getTime() > DRAFT_TTL) return null;
  return d as Draft;
}

export async function setDraft(userId: string, d: Draft) {
  await User.updateOne({ _id: userId }, { $set: { tgDraft: d } });
}

export async function clearDraft(userId: string) {
  await User.updateOne({ _id: userId }, { $set: { tgDraft: null } });
}
