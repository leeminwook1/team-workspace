import { z } from "zod";

// 설계 2장 — 폼/검증: Zod 스키마를 프론트·백엔드에서 공유

export const registerSchema = z.object({
  name: z.string().min(2, "이름은 2자 이상").max(30),
  email: z.string().email("올바른 이메일을 입력하세요"),
  password: z.string().min(8, "비밀번호는 8자 이상").max(100),
  // 신청자가 희망 소속 팀·역할을 선택 (팀 역할만 — 전사 역할은 관리자가 승인 시 부여)
  teamId: z.string().min(1).nullable().optional().default(null),
  role: z.enum(["member", "vice_leader", "leader"]).optional().default("member"),
});

export const taskCreateSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(120),
  description: z.string().max(2000).optional().default(""),
  teamIds: z.array(z.string().min(1)).min(1, "팀을 하나 이상 선택하세요"),
  categoryId: z.string().nullable().optional(),
  assignees: z.array(z.string()).optional().default([]),
  startDate: z.string().min(1), // ISO date 또는 datetime
  endDate: z.string().min(1),
  allDay: z.boolean().optional().default(true),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
  location: z.string().max(120).optional().default(""),
  // 반복 일정 — 생성 시에만. repeatUntil까지 오커런스를 미리 생성(최대 60개)
  repeat: z.enum(["none", "daily", "weekly", "biweekly", "monthly"]).optional().default("none"),
  repeatUntil: z.string().optional(),
  // 대여 장비 — 선택 시 업무 기간에 자원 예약 자동 생성 (반복 일정과는 함께 불가)
  resourceIds: z.array(z.string().min(1)).max(40, "장비는 최대 40개까지 선택할 수 있어요").optional().default([]),
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  teamIds: z.array(z.string().min(1)).min(1).optional(),
  categoryId: z.string().nullable().optional(),
  assignees: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  allDay: z.boolean().optional(),
  status: z.enum(["todo", "in_progress", "done", "hold"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  location: z.string().max(120).optional(),
  resourceIds: z.array(z.string().min(1)).max(40, "장비는 최대 40개까지 선택할 수 있어요").optional(), // undefined = 장비 변경 없음
});

// 행사 관리 — 행사(컨테이너) + 그 안의 투두(items) 칸반
export const eventCreateSchema = z.object({
  title: z.string().min(1, "행사명을 입력하세요").max(200),
  description: z.string().max(2000).optional().default(""),
  teamIds: z.array(z.string().min(1)).min(1, "참여 팀을 하나 이상 선택하세요"),
  managerId: z.string().nullable().optional(),
  eventDate: z.string().nullable().optional(),
  location: z.string().max(120).optional().default(""),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
});
const eventItemSchema = z.object({
  id: z.string().optional(), // 기존 항목이면 _id 유지
  title: z.string().min(1).max(200),
  status: z.enum(["todo", "doing", "hold", "done"]).optional().default("todo"),
  teamId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  note: z.string().max(500).optional().default(""),
});
export const eventUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  teamIds: z.array(z.string().min(1)).min(1).optional(),
  managerId: z.string().nullable().optional(),
  eventDate: z.string().nullable().optional(),
  location: z.string().max(120).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  items: z.array(eventItemSchema).optional(),
  closed: z.boolean().optional(), // 행사 종료(보관)/재개
});

// 지시(하달) — 발신은 전사 역할, 대상은 팀(그 팀장이 수신)
export const directiveCreateSchema = z.object({
  title: z.string().min(1, "TODO 제목을 입력하세요").max(200),
  body: z.string().max(2000).optional().default(""),
  teamId: z.string().min(1, "대상 팀을 선택하세요"),
  dueDate: z.string().nullable().optional(), // ISO date 또는 null
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
});

const assignmentSchema = z.object({
  userId: z.string().min(1),
  note: z.string().max(300).optional().default(""),
  done: z.boolean().optional().default(false),
});

export const directiveUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(2000).optional(),
  dueDate: z.string().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: z.enum(["todo", "in_progress", "done", "hold"]).optional(),
  assignments: z.array(assignmentSchema).optional(),
});

// 내 계정 — 이름·비밀번호 변경 (이메일은 로그인 식별자라 수정 불가)
export const meUpdateSchema = z.object({
  name: z.string().min(2, "이름은 2자 이상").max(30).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "새 비밀번호는 8자 이상").max(100).optional(),
  // 텔레그램 챗 ID — 숫자(그룹은 음수 허용), 빈 문자열 = 연동 해제
  telegramChatId: z.string().max(32).regex(/^-?\d*$/, "챗 ID는 숫자만 입력하세요").optional(),
  // 텔레그램 알림 수신 설정 — 항목별 on/off (앱 내 알림은 항상 생성)
  notifyPrefs: z
    .object({
      assign: z.boolean().optional(),
      due: z.boolean().optional(),
      directive: z.boolean().optional(),
      equip: z.boolean().optional(),
    })
    .optional(),
});

// 개인 캘린더 일정
export const personalEventSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(120),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  allDay: z.boolean().optional().default(true),
  memo: z.string().max(1000).optional().default(""),
  location: z.string().max(120).optional().default(""),
});

export const teamSchema = z.object({
  name: z.string().min(1, "팀 이름을 입력하세요").max(30),
  slug: z
    .string()
    .min(1)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "slug는 영문 소문자·숫자·하이픈만"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "색상 형식: #RRGGBB"),
  description: z.string().max(200).optional().default(""),
  // 팀 텔레그램 그룹방 챗 ID (음수 허용, 빈 문자열 = 브리핑 끔)
  telegramChatId: z.string().max(32).regex(/^-?\d*$/, "챗 ID는 숫자만 입력하세요").optional(),
});

const roleEnum = z.enum(["admin", "manager", "deputy", "secretary", "leader", "vice_leader", "member"]);

// 단일 역할 + 소속 팀(팀 역할일 때만). role이 팀 역할이면 teamId 필수.
export const approveSchema = z
  .object({
    role: roleEnum,
    teamId: z.string().nullable().optional(),
  })
  .refine(
    (d) => !["leader", "vice_leader", "member"].includes(d.role) || !!d.teamId,
    { message: "팀 역할은 소속 팀을 선택해야 합니다.", path: ["teamId"] }
  );

export const userUpdateSchema = z.object({
  role: roleEnum.optional(),
  teamId: z.string().nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const resourceSchema = z.object({
  name: z.string().min(1, "자원 이름을 입력하세요").max(60),
  categoryId: z.string().min(1, "분류를 선택하세요"),
  ownerTeamId: z.string().nullable().optional().default(null), // 관리 팀 (null = 공용)
  managerId: z.string().nullable().optional().default(null), // 관리 담당자
});
export const resourceCategorySchema = z.object({
  name: z.string().min(1, "분류 이름을 입력하세요").max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "색상은 #RRGGBB 형식").optional(),
});

export const categorySchema = z.object({
  name: z.string().min(1, "카테고리 이름을 입력하세요").max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "색상 형식: #RRGGBB"),
});

export const reservationSchema = z.object({
  resourceId: z.string().min(1),
  teamId: z.string().min(1),
  startAt: z.string().min(1), // ISO datetime
  endAt: z.string().min(1),
  note: z.string().max(300).optional().default(""),
});
