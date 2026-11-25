import { canCreateDirective, type SessionUser } from "./permissions";

// TODO 조회 범위 — 과장·admin은 전체, 과원은 자기가 지정된 TODO만
export function directiveScope(user: SessionUser): Record<string, any> {
  if (canCreateDirective(user)) return {};
  return { assignments: { $elemMatch: { userId: user.id } } };
}

// 대기 중인 TODO — 과장: 완료·보류가 아닌 것 / 과원: 내 몫을 아직 완료 안 한 것
export function pendingDirectiveQuery(user: SessionUser): Record<string, any> {
  if (canCreateDirective(user)) return { status: { $in: ["todo", "in_progress"] } };
  return { status: { $in: ["todo", "in_progress"] }, assignments: { $elemMatch: { userId: user.id, done: false } } };
}
