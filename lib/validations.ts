import { z } from "zod";

// 설계 2장 — 폼/검증: Zod 스키마를 프론트·백엔드에서 공유

export const registerSchema = z.object({
  name: z.string().min(2, "이름은 2자 이상").max(30),
  email: z.string().email("올바른 이메일을 입력하세요"),
  password: z.string().min(8, "비밀번호는 8자 이상").max(100),
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
});

// 지시(하달) — 발신은 전사 역할, 대상은 팀(그 팀장이 수신)
export const directiveCreateSchema = z.object({
  title: z.string().min(1, "지시 제목을 입력하세요").max(200),
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

export const teamSchema = z.object({
  name: z.string().min(1, "팀 이름을 입력하세요").max(30),
  slug: z
    .string()
    .min(1)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "slug는 영문 소문자·숫자·하이픈만"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "색상 형식: #RRGGBB"),
  description: z.string().max(200).optional().default(""),
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
  category: z.enum(["studio", "camera", "venue", "audio", "edit", "etc"]),
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
