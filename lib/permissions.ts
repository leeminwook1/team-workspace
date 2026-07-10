// 단일 역할 체계 (1인 1팀)
// - admin(최고관리자): 시스템 관리·전체 삭제·전체 조회 (최상위)
// - manager(과장)·deputy(부과장): 모든 팀 조회 + 전 팀 등록·수정 + 가입 승인 (삭제 ✕)
// - secretary(서기): 모든 팀 조회 (읽기 전용)
// - leader(팀장): 소속 팀 등록·수정·삭제
// - vice_leader(부팀장): 소속 팀 등록·수정 (삭제 ✕)
// - member(팀원): 소속 팀 조회 + 본인 담당 업무 상태 변경

export type Role = "admin" | "manager" | "deputy" | "secretary" | "leader" | "vice_leader" | "member";

export type SessionUser = {
  id: string;
  name?: string | null;
  role: Role;
  teamId: string | null;
  status: "pending" | "active" | "disabled";
};

const ORG_ROLES: Role[] = ["admin", "manager", "deputy", "secretary"]; // 전체 팀 조회
const ORG_EDITORS: Role[] = ["admin", "manager", "deputy"]; // 전 팀 등록·수정 + 가입 승인
const TEAM_EDITORS: Role[] = ["leader", "vice_leader"]; // 소속 팀 등록·수정

export const ROLE_LABEL: Record<Role, string> = {
  admin: "최고관리자",
  manager: "과장",
  deputy: "부과장",
  secretary: "서기",
  leader: "팀장",
  vice_leader: "부팀장",
  member: "팀원",
};
export function isTeamRole(role: Role) {
  return role === "leader" || role === "vice_leader" || role === "member";
}

export function isActive(u: SessionUser) {
  return u.status === "active";
}
export function canViewAllTeams(u: SessionUser) {
  return ORG_ROLES.includes(u.role);
}
export function inTeam(u: SessionUser, teamId: string) {
  return u.teamId != null && String(u.teamId) === String(teamId);
}
export function visibleTeamIds(u: SessionUser): string[] | "all" {
  if (canViewAllTeams(u)) return "all";
  return u.teamId ? [u.teamId] : [];
}

export function canCreateTask(u: SessionUser, teamId: string) {
  if (!isActive(u)) return false;
  if (ORG_EDITORS.includes(u.role)) return true;
  return TEAM_EDITORS.includes(u.role) && inTeam(u, teamId);
}
export const canEditTask = canCreateTask; // 등록 = 수정 권한 동일

export function canDeleteTask(u: SessionUser, teamId: string) {
  if (!isActive(u)) return false;
  if (u.role === "admin") return true;
  return u.role === "leader" && inTeam(u, teamId); // 삭제는 팀장·Admin만
}
export function canChangeStatus(u: SessionUser, teamId: string, assigneeIds: string[]) {
  if (canEditTask(u, teamId)) return true;
  return u.role === "member" && inTeam(u, teamId) && assigneeIds.includes(u.id);
}

export function canApproveUsers(u: SessionUser) {
  return isActive(u) && ORG_EDITORS.includes(u.role); // admin·과장·부과장
}
export function canManageTeams(u: SessionUser) {
  return isActive(u) && u.role === "admin"; // 시스템 관리 = 최고관리자만
}
export function canReserve(u: SessionUser, teamId: string) {
  return canCreateTask(u, teamId);
}

// ── 다중 팀 업무(협업) 기준 헬퍼 ──
export function canCreateTaskInAll(u: SessionUser, teamIds: string[]) {
  return teamIds.length > 0 && teamIds.every((id) => canCreateTask(u, id));
}
export function canEditTaskAny(u: SessionUser, teamIds: string[]) {
  return teamIds.some((id) => canEditTask(u, id));
}
export function canDeleteTaskAny(u: SessionUser, teamIds: string[]) {
  return teamIds.some((id) => canDeleteTask(u, id));
}
export function canChangeStatusAny(u: SessionUser, teamIds: string[], assigneeIds: string[]) {
  return teamIds.some((id) => canChangeStatus(u, id, assigneeIds));
}
