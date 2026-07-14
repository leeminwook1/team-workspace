import { connectDB } from "./mongodb";
import { ActivityLog } from "@/models/ActivityLog";
import { touchChanged } from "./changes";

type Action = "create" | "update" | "delete" | "status" | "login" | "approve";

// 활동 로그 기록. 실패해도 본래 작업(업무 생성·수정·삭제)을 절대 막지 않는다.
export async function logActivity(args: {
  actorId: string;
  actorName?: string | null;
  action: Action;
  targetTitle: string;
  targetType?: "task" | "directive" | "event" | "reservation" | "user" | "absence";
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
  // 자동 반영용 변경 신호 — 활동 로그를 남기는 모든 변경을 한 곳에서 커버
  await touchChanged(args.targetType ?? "task");
}

// 예약 로그 제목: "카메라 1호 · 7. 15. 10:00~12:00" (KST 기준)
export function reservationLabel(resourceName: string, startAt: Date, endAt: Date) {
  const d = (x: Date) => x.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
  const t = (x: Date) => x.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${resourceName} · ${d(startAt)} ${t(startAt)}~${t(endAt)}`;
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
