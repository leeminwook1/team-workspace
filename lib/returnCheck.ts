import { User } from "@/models/User";
import { notify } from "./notify";

// 반납 체크리스트 — 배터리 충전 / 메모리 백업·포맷 / 외관·작동 이상 없음
export type ReturnCheck = { battery: boolean; memory: boolean; condition: boolean; note: string };

/** 요청 본문 검증. check가 없으면 null(체크리스트 생략 — 자동 반납 등). 잘못된 값이면 { error } */
export function parseReturnCheck(raw: any): ReturnCheck | null | { error: string } {
  if (raw == null) return null;
  const c: ReturnCheck = {
    battery: raw.battery === true,
    memory: raw.memory === true,
    condition: raw.condition === true,
    note: typeof raw.note === "string" ? raw.note.trim().slice(0, 300) : "",
  };
  if (!c.condition && !c.note) return { error: "이상이 있으면 어떤 문제인지 적어주세요." };
  return c;
}

/** 이상 신고 — 장비 담당자 + 과장에게 알림 (처리자 본인 제외) */
export async function reportIssue(names: string[], check: ReturnCheck, actor: { id: string; name?: string | null }, managerIds: string[]) {
  if (check.condition) return;
  const leaders: any[] = await User.find({ role: "leader", status: "active" }).select("_id").lean();
  const to = Array.from(new Set([...managerIds, ...leaders.map((l) => String(l._id))])).filter((id) => id && id !== actor.id);
  await notify(to, {
    type: "reservation",
    title: "⚠️ 반납 장비에 이상이 있어요",
    body: `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` 외 ${names.length - 3}개` : ""} — ${check.note} (${actor.name ?? ""})`,
    link: "/admin/resources",
  });
}
