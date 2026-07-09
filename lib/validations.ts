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
  teamId: z.string().min(1),
  assignees: z.array(z.string()).optional().default([]),
  startDate: z.string().min(1), // ISO date
  endDate: z.string().min(1),
  allDay: z.boolean().optional().default(true),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
  location: z.string().max(120).optional().default(""),
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  assignees: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  allDay: z.boolean().optional(),
  status: z.enum(["todo", "in_progress", "done", "hold"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  location: z.string().max(120).optional(),
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

export const approveSchema = z.object({
  teams: z
    .array(
      z.object({
        teamId: z.string().min(1),
        role: z.enum(["leader", "vice_leader", "member"]),
      })
    )
    .default([]),
  orgRole: z.enum(["admin", "manager", "deputy", "secretary"]).nullable().optional(),
});

export const reservationSchema = z.object({
  resourceId: z.string().min(1),
  teamId: z.string().min(1),
  startAt: z.string().min(1), // ISO datetime
  endAt: z.string().min(1),
  note: z.string().max(300).optional().default(""),
});
