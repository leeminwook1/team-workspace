import { Schema, models, model } from "mongoose";

// 행사 관리 — 행사(컨테이너) 하나당 그 안의 투두(items)를 칸반으로 관리.
// items 상태: todo(할 일) → doing(진행중) → done(완료)
const EventItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    status: { type: String, enum: ["todo", "doing", "hold", "done"], default: "todo" },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", default: null }, // 담당 팀(팀별 필터)
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    dueDate: { type: Date, default: null }, // 투두 마감일(행사별 달력·지연 표시)
    note: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { _id: true }
);

const EventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 2000 },
    teamIds: [{ type: Schema.Types.ObjectId, ref: "Team" }], // 참여 팀(태깅)
    managerId: { type: Schema.Types.ObjectId, ref: "User", default: null }, // 담당자
    eventDate: { type: Date, default: null }, // 행사일 → D-day
    location: { type: String, default: "" },
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },
    items: { type: [EventItemSchema], default: [] }, // 행사 안의 투두(칸반 카드)
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

EventSchema.index({ eventDate: 1 });

export const Event = models.Event || model("Event", EventSchema);
