import { connectDB } from "./mongodb";
import { ActivityLog } from "@/models/ActivityLog";

type Action = "create" | "update" | "delete" | "status" | "login";

// 활동 로그 기록. 실패해도 본래 작업(업무 생성·수정·삭제)을 절대 막지 않는다.
export async function logActivity(args: {
  actorId: string;
  actorName?: string | null;
  action: Action;
  targetTitle: string;
  targetType?: "task" | "directive";
  meta?: Record<string, unknown>;
}) {
  try {
    await connectDB();
    await ActivityLog.create({
      actorId: args.actorId,
      actorName: args.actorName || "알 수 없음",
      action: args.action,
      targetType: args.targetType ?? "task",
      targetTitle: args.targetTitle,
      meta: args.meta ?? {},
    });
  } catch (e) {
    console.error("[activity] 기록 실패:", e);
  }
}

// 로그인 기록 (로그인 로그 탭). 실패해도 로그인 흐름을 막지 않는다.
export async function logLogin(args: { actorId: string; actorName?: string | null; email?: string | null }) {
  try {
    await connectDB();
    await ActivityLog.create({
      actorId: args.actorId,
      actorName: args.actorName || "알 수 없음",
      action: "login",
      targetType: "auth",
      targetTitle: args.email || "",
      meta: {},
    });
  } catch (e) {
    console.error("[activity] 로그인 기록 실패:", e);
  }
}
