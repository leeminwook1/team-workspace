// 단일 역할 체계 (1인 1팀)
// - admin(최고관리자): 시스템 관리·전체 삭제·전체 조회 (최상위)
// - manager(과장)·deputy(부과장): 모든 팀 조회 + 전 팀 등록·수정 + 가입 승인 (삭제 ✕)
// - secretary(서기): 모든 팀 조회 + 전 팀 등록·수정 (가입 승인·삭제 ✕)
// - leader(팀장): 소속 팀 등록·수정·삭제
// - vice_leader(부팀장): 소속 팀 등록·수정 (삭제 ✕)
// - member(팀원): 소속 팀 조회·일정 등록·자원 예약 + 본인이 만든 일정 수정·삭제 + 본인 담당 업무 상태 변경

export type Role = "admin" | "manager" | "deputy" | "secretary" | "leader" | "vice_leader" | "member";

export type SessionUser = {
  id: string;
  name?: string | null;
  role: Role;
  teamId: string | null;
  status: "pending" | "active" | "disabled";
};

const ORG_ROLES: Role[] = ["admin", "manager", "deputy", "secretary"]; // 전체 팀 조회
const ALL_TEAM_EDITORS: Role[] = ["admin", "manager", "deputy", "secretary"]; // 전 팀 등록·수정
const APPROVERS: Role[] = ["admin", "manager", "deputy"]; // 가입 승인
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
  if (ALL_TEAM_EDITORS.includes(u.role)) return true;
  // 팀원 포함 — 소속 팀이면 누구나 일정 등록 가능
  return isTeamRole(u.role) && inTeam(u, teamId);
}
// 수정: 전사 편집자·팀장·부팀장 (팀원은 본인이 만든 일정만 — canEditTaskDoc에서 처리)
export function canEditTask(u: SessionUser, teamId: string) {
  if (!isActive(u)) return false;
  if (ALL_TEAM_EDITORS.includes(u.role)) return true;
  return TEAM_EDITORS.includes(u.role) && inTeam(u, teamId);
}

export function canDeleteTask(u: SessionUser, teamId: string) {
  if (!isActive(u)) return false;
  if (u.role === "admin") return true;
  return u.role === "leader" && inTeam(u, teamId); // 삭제는 팀장·Admin만
}
export function canChangeStatus(u: SessionUser, teamId: string, assigneeIds: string[]) {
  if (canEditTask(u, teamId)) return true;
  return u.role === "member" && inTeam(u, teamId) && assigneeIds.includes(u.id);
}

// ── 행사 관리 (칸반) ──
// 조회는 전체 활성 유저(공유 보드). 관리(등록·수정·단계이동)는 편집자 역할.
// 팀 멤버십과 무관 — 팀은 태깅일 뿐이라 교차팀/무팀 403 함정을 피한다.
const EVENT_MANAGERS: Role[] = ["admin", "manager", "deputy", "secretary", "leader", "vice_leader"];
export function canManageEvents(u: SessionUser) {
  return isActive(u) && EVENT_MANAGERS.includes(u.role);
}
export function canDeleteEvent(u: SessionUser, createdById: string) {
  if (!isActive(u)) return false;
  if (APPROVERS.includes(u.role)) return true; // admin·과장·부과장
  return String(u.id) === String(createdById); // 그 외엔 본인이 만든 것만
}

// ── 지시(하달) ──
// 발신: 전사 역할(전 팀 편집자). 수신: 대상 팀의 팀장.
export function canCreateDirective(u: SessionUser) {
  return isActive(u) && ALL_TEAM_EDITORS.includes(u.role);
}
// 지시를 받는 사람(대상 팀의 팀장)인가
export function isDirectiveLeader(u: SessionUser, teamId: string) {
  return isActive(u) && u.role === "leader" && inTeam(u, teamId);
}
// 지시함에서 이 지시를 볼 수 있는가 (발신 그룹은 전체, 그 외엔 대상 팀 팀장만)
export function canViewDirective(u: SessionUser, teamId: string) {
  if (!isActive(u)) return false;
  if (ALL_TEAM_EDITORS.includes(u.role)) return true;
  return isDirectiveLeader(u, teamId);
}
// 상태 변경·팀원 재분배 (팀장 또는 admin)
export function canManageDirective(u: SessionUser, teamId: string) {
  if (!isActive(u)) return false;
  if (u.role === "admin") return true;
  return isDirectiveLeader(u, teamId);
}
// 지시 삭제·본문 수정 (발신자 본인 또는 admin)
export function canEditDirective(u: SessionUser, createdById: string) {
  if (!isActive(u)) return false;
  return u.role === "admin" || String(u.id) === String(createdById);
}
// 지시함 메뉴 노출 대상 (발신 가능하거나 팀장)
export function canUseDirectives(u: SessionUser) {
  return isActive(u) && (ALL_TEAM_EDITORS.includes(u.role) || u.role === "leader");
}

export function canApproveUsers(u: SessionUser) {
  return isActive(u) && APPROVERS.includes(u.role); // admin·과장·부과장 (서기 ✕)
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
// 문서 단위 수정·삭제 — 역할 권한 또는 본인이 만든 일정 (팀원의 자기 일정 관리)
export function canEditTaskDoc(u: SessionUser, teamIds: string[], createdById: string | null) {
  return canEditTaskAny(u, teamIds) || (isActive(u) && createdById != null && String(createdById) === String(u.id));
}
export function canDeleteTaskDoc(u: SessionUser, teamIds: string[], createdById: string | null) {
  return canDeleteTaskAny(u, teamIds) || (isActive(u) && createdById != null && String(createdById) === String(u.id));
}
export function canChangeStatusAny(u: SessionUser, teamIds: string[], assigneeIds: string[]) {
  return teamIds.some((id) => canChangeStatus(u, id, assigneeIds));
}
