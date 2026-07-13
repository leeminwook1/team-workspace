import { Schema, models, model } from "mongoose";

// 활동 로그 — 누가·언제·무엇을 했는지 (감사 기록)
// 사용자·업무가 삭제돼도 기록이 남도록 이름/제목은 스냅샷(문자열)으로 저장한다.
const ActivityLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorName: { type: String, default: "알 수 없음" }, // 스냅샷
    action: { type: String, enum: ["create", "update", "delete", "status", "login", "approve"], required: true },
    targetType: { type: String, default: "task" }, // task | directive | event | reservation | user | auth
    targetTitle: { type: String, default: "" }, // 스냅샷
    meta: { type: Schema.Types.Mixed, default: {} }, // 예: { status: "done" }
  },
  { timestamps: true }
);

ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ targetType: 1, createdAt: -1 }); // 관리자 활동/로그인 탭 조회용
// 180일 지난 로그 자동 삭제 — 무한 성장 방지 (감사 기록은 6개월 보존)
ActivityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

export const ActivityLog = models.ActivityLog || model("ActivityLog", ActivityLogSchema);
