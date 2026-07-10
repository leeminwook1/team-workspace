import { connectDB } from "./mongodb";
import { ActivityLog } from "@/models/ActivityLog";

type Action = "create" | "update" | "delete" | "status";

// 활동 로그 기록. 실패해도 본래 작업(업무 생성·수정·삭제)을 절대 막지 않는다.
export async function logActivity(args: {
  actorId: string;
  actorName?: string | null;
  action: Action;
  targetTitle: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await connectDB();
    await ActivityLog.create({
      actorId: args.actorId,
      actorName: args.actorName || "알 수 없음",
      action: args.action,
      targetType: "task",
      targetTitle: args.targetTitle,
      meta: args.meta ?? {},
    });
  } catch (e) {
    console.error("[activity] 기록 실패:", e);
  }
}
