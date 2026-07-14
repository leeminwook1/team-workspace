import { Task } from "@/models/Task";
import "@/models/Team";

// 중복 일정 감지 — 여러 팀이 같은 행사를 각자 등록해 과장단 화면에 겹치는 것을 막는다.
// 웹 등록 모달과 텔레그램 /일정 이 공유. "감지 → 기존 일정에 내 팀 추가" 흐름의 판정부.

// 제목 정규화 — 공백·구두점 제거 + 소문자
export function normTitle(s: string) {
  return s.toLowerCase().replace(/[\s\-_·.,!?~()[\]/]+/g, "");
}

// 유사 판정: 정규화 후 한쪽이 다른 쪽을 포함하거나, 2자 이상 단어가 2개 이상 겹치면 같은 일정으로 본다
// 예) "국화축제 지원" ↔ "국화 축제 사진 지원" — 포함은 아니지만 "국화"·"축제"·"지원" 겹침
export function titlesSimilar(a: string, b: string) {
  const x = normTitle(a), y = normTitle(b);
  if (x.length < 2 || y.length < 2) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const tokens = a.toLowerCase().split(/\s+/).filter((t) => normTitle(t).length >= 2);
  const shared = tokens.filter((t) => y.includes(normTitle(t)));
  return shared.length >= 2;
}

export type SimilarTask = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  teams: { id: string; name: string; color: string }[];
};

// 기간이 겹치는 일정 중 제목이 유사한 것 (팀 무관 전체 검색 — 다른 팀 중복을 잡는 게 목적)
export async function findSimilarTasks(title: string, from: Date, to: Date, limit = 3): Promise<SimilarTask[]> {
  if (normTitle(title).length < 2) return [];
  const candidates: any[] = await Task.find({ startDate: { $lt: to }, endDate: { $gt: from } })
    .populate("teamIds", "name color")
    .sort({ startDate: 1 })
    .limit(300)
    .lean();
  return candidates
    .filter((t) => titlesSimilar(title, t.title))
    .slice(0, limit)
    .map((t) => ({
      id: String(t._id),
      title: t.title,
      startDate: t.startDate,
      endDate: t.endDate,
      allDay: !!t.allDay,
      teams: (t.teamIds ?? []).filter(Boolean).map((tm: any) => ({
        id: String(tm._id ?? tm), name: tm.name ?? "", color: tm.color ?? "#8b95a1",
      })),
    }));
}
