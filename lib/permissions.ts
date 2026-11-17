// 사진과 직급 체계 — 부장단(부장·서무·총교관) → 과장·부과장 → 과원
// 역할 키는 문화부 시절 값을 유지하고 표시명만 바꿨다 (DB 마이그레이션 없이 전환).
// - admin(시스템 관리자): 계정·설정 관리, 전체 권한
// - 부장단 = manager(부장)·secretary(서무)·deputy(총교관): 전체 조회·등록·수정, TODO 지시, 가입 승인 (삭제 ✕)
// - leader(과장): 과 일정 등록·수정·삭제, 지시 수신·배분, 과원 개인일정 열람, 가입 승인
// - vice_leader(부과장): 과 일정 등록·수정 (삭제 ✕)
// - member(과원): 일정 등록·장비 예약 + 본인이 만든 일정 수정·삭제 + 본인 담당 업무 상태 변경
// "팀"은 사진과 하나만 남아(lib/dept.ts) 아래의 inTeam 검사는 곧 "사진과 소속" 검사다.

export type Role = "admin" | "manager" | "deputy" | "secretary" | "leader" | "vice_leader" | "member";

export type SessionUser = {
  id: string;
  name?: string | null;
  role: Role;
  teamId: string | null;
  status: "pending" | "active" | "disabled";
};

export const BOARD_ROLES: Role[] = ["manager", "secretary", "deputy"]; // 부장단
const ORG_ROLES: Role[] = ["admin", ...BOARD_ROLES]; // 전체 조회
const ALL_TEAM_EDITORS: Role[] = ["admin", ...BOARD_ROLES]; // 전체 등록·수정
const APPROVERS: Role[] = ["admin", ...BOARD_ROLES, "leader"]; // 가입 승인 (과장 포함)
const TEAM_EDITORS: Role[] = ["leader", "vice_leader"]; // 소속 팀 등록·수정

export const ROLE_LABEL: Record<Role, string> = {
  admin: "시스템 관리자",
  manager: "부장",
  secretary: "서무",
  deputy: "총교관",
  leader: "과장",
  vice_leader: "부과장",
  member: "과원",
};
// 직급 표시 순서 (선택 목록·정렬용)
export const ROLE_ORDER: Role[] = ["manager", "secretary", "deputy", "leader", "vice_leader", "member", "admin"];
export function isBoardRole(role: Role) {
  return BOARD_ROLES.includes(role);
}
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
  if (APPROVERS.includes(u.role)) return true; // admin·부장단·과장
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

// ── 과제 (레퍼런스 촬영 과제) ──
// 출제·마감·피드백: admin 또는 그 팀의 팀장·부팀장. 열람: 그 팀 소속 + 전사 역할. 제출: 그 팀 소속.
export function canManageAssignments(u: SessionUser, teamId: string) {
  if (!isActive(u)) return false;
  if (u.role === "admin") return true;
  return (u.role === "leader" || u.role === "vice_leader") && inTeam(u, teamId);
}
export function canViewAssignment(u: SessionUser, teamId: string) {
  return isActive(u) && (canViewAllTeams(u) || inTeam(u, teamId));
}
export function canSubmitAssignment(u: SessionUser, teamId: string) {
  return isActive(u) && isTeamRole(u.role) && inTeam(u, teamId);
}

// ── 개인 캘린더 ──
// 본인 + 과장(과원 것) + admin + (부장단은 과장 것만) 열람. 수정은 본인만.
export function canViewPersonalCalendar(viewer: SessionUser, target: { id: string; teamId: string | null; role?: Role }) {
  if (!isActive(viewer)) return false;
  if (String(viewer.id) === String(target.id)) return true;
  if (viewer.role === "admin") return true;
  // 부장단 → 과장 개인 캘린더만
  if (BOARD_ROLES.includes(viewer.role) && target.role === "leader") return true;
  return viewer.role === "leader" && viewer.teamId != null && target.teamId != null
    && String(viewer.teamId) === String(target.teamId);
}

// ── 공지사항 ──
// 조회: 전체 활성 사용자. 작성: 전사 역할. 수정·삭제: 작성자 본인 또는 admin.
export function canCreateNotice(u: SessionUser) {
  return isActive(u) && ALL_TEAM_EDITORS.includes(u.role);
}
export function canEditNotice(u: SessionUser, createdById: string) {
  return isActive(u) && (u.role === "admin" || String(u.id) === String(createdById));
}

// ── 피드백 게시판 ──
// 작성·댓글·공감: 전체 활성 사용자. 상태 변경(접수→진행중→반영): admin. 삭제·본문 수정: 작성자 또는 admin.
export function canManageFeedback(u: SessionUser) {
  return isActive(u) && u.role === "admin";
}
export function canEditFeedback(u: SessionUser, createdById: string) {
  return isActive(u) && (u.role === "admin" || String(u.id) === String(createdById));
}

export function canApproveUsers(u: SessionUser) {
  return isActive(u) && APPROVERS.includes(u.role); // admin·부장단·과장
}

// 부재·휴가 등록/삭제 — 본인 / admin·부장단 / 과장·부과장
export function canManageAbsence(u: SessionUser, target: { id: string; teamId: string | null }) {
  if (!isActive(u)) return false;
  if (String(u.id) === String(target.id)) return true;
  if (ALL_TEAM_EDITORS.includes(u.role)) return true;
  return ["leader", "vice_leader"].includes(u.role) && u.teamId != null && target.teamId != null
    && String(u.teamId) === String(target.teamId);
}

export function canManageTeams(u: SessionUser) {
  return isActive(u) && u.role === "admin"; // 시스템 관리 = 시스템 관리자만
}
export function canReserve(u: SessionUser, teamId: string) {
  return canCreateTask(u, teamId);
}
// 장비 반납 처리 — 예약자 본인, admin·부장단·과장, 또는 그 장비 담당자
export function canMarkReturned(u: SessionUser, reservedById: string, resourceManagerId?: string | null) {
  if (!isActive(u)) return false;
  if (APPROVERS.includes(u.role)) return true;
  if (String(reservedById) === String(u.id)) return true;
  return resourceManagerId != null && String(resourceManagerId) === String(u.id);
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
