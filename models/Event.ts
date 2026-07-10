import { Schema, models, model } from "mongoose";

// 행사 관리 — 칸반 보드로 진행 단계를 관리하는 큰 단위의 행사/프로젝트.
// 업무(달력)·지시(TODO)와 별개. 단계: 기획→준비→진행→완료.
const ChecklistItemSchema = new Schema(
  { text: { type: String, required: true, trim: true, maxlength: 200 }, done: { type: Boolean, default: false } },
  { _id: true }
);

const EventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 2000 },
    stage: { type: String, enum: ["planning", "preparing", "ongoing", "done"], default: "planning", index: true },
    teamIds: [{ type: Schema.Types.ObjectId, ref: "Team" }], // 참여 팀(태깅)
    managerId: { type: Schema.Types.ObjectId, ref: "User", default: null }, // 담당자
    eventDate: { type: Date, default: null }, // 행사일 → D-day
    location: { type: String, default: "" },
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },
    checklist: { type: [ChecklistItemSchema], default: [] }, // 준비 항목(진행률)
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

EventSchema.index({ stage: 1, eventDate: 1 });

export const Event = models.Event || model("Event", EventSchema);
