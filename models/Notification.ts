import { Schema, models, model } from "mongoose";

// 앱 내 알림 — 가입 승인·담당자 배정·TODO 지시 도착 등
const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, default: "info" }, // approved | task_assigned | directive | info
    title: { type: String, required: true },
    body: { type: String, default: "" },
    link: { type: String, default: "" }, // 클릭 시 이동할 앱 내 경로
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification = models.Notification || model("Notification", NotificationSchema);
