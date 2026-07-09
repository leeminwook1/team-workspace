// 설계 3.2 권한 매트릭스 (확정본)
// - 과장(manager)·부과장(deputy): 모든 팀 조회 + 전 팀 등록·수정 + 가입 승인 (삭제 ✕)
// - 서기(secretary): 모든 팀 조회 (읽기 전용)
// - 팀장(leader): 자기팀 등록·수정·삭제·팀원배정 / 부팀장(vice_leader): 등록·수정
// - 팀원(member): 조회 + 본인 담당 업무 상태 변경

export type SessionUser = {
  id: string;
  orgRole: "admin" | "manager" | "deputy" | "secretary" | null;
  status: "pending" | "active" | "disabled";
  teams: { teamId: string; role: "leader" | "vice_leader" | "member" }[];
};

const ORG_EDITORS = ["admin", "manager", "deputy"]; // 전 팀 등록·수정 + 가입승인

export function isActive(u: SessionUser) {
  return u.status === "active";
}

export function canViewAllTeams(u: SessionUser) {
  return u.orgRole != null; // admin·과장·부과장·서기 모두 전 팀 조회
}

export function teamRole(u: SessionUser, teamId: string) {
  return u.teams.find((t) => t.teamId === String(teamId))?.role ?? null;
}

export function visibleTeamIds(u: SessionUser): string[] | "all" {
  return canViewAllTeams(u) ? "all" : u.teams.map((t) => t.teamId);
}

export function canCreateTask(u: SessionUser, teamId: string) {
  if (!isActive(u)) return false;
  if (ORG_EDITORS.includes(u.orgRole ?? "")) return true;
  const r = teamRole(u, teamId);
  return r === "leader" || r === "vice_leader";
}

export const canEditTask = canCreateTask; // 등록 = 수정 권한 동일 (설계 확정)

export function canDeleteTask(u: SessionUser, teamId: string) {
  if (!isActive(u)) return false;
  if (u.orgRole === "admin") return true;
  return teamRole(u, teamId) === "leader"; // 삭제는 팀장만 (부팀장·과장 ✕)
}

export function canChangeStatus(u: SessionUser, teamId: string, assigneeIds: string[]) {
  if (canEditTask(u, teamId)) return true;
  // 팀원: 본인이 담당자인 업무만
  return teamRole(u, teamId) === "member" && assigneeIds.includes(u.id);
}

export function canApproveUsers(u: SessionUser) {
  return isActive(u) && ORG_EDITORS.includes(u.orgRole ?? "");
}

export function canManageTeams(u: SessionUser) {
  return isActive(u) && u.orgRole === "admin";
}

export function canReserve(u: SessionUser, teamId: string) {
  // 예약: 팀장·부팀장·과장·부과장·Admin (설계 7장 API 표)
  return canCreateTask(u, teamId);
}
