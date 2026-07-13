import { Schema, models, model } from "mongoose";

// 설계 4.3 — 업무 = 달력 이벤트
const TaskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    teamIds: [{ type: Schema.Types.ObjectId, ref: "Team", required: true }], // 다중 팀(협업 업무)
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null }, // 일정 카테고리(선택)
    assignees: [{ type: Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    allDay: { type: Boolean, default: true },

    // 반복 일정 — 같은 반복 묶음의 오커런스들이 공유하는 id (생성 시 확정, null = 단건)
    recurrenceId: { type: Schema.Types.ObjectId, default: null, index: true },

    status: { type: String, enum: ["todo", "in_progress", "done", "hold"], default: "todo" },
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },

    tags: [{ type: String }],
    location: { type: String, default: "" },
  },
  { timestamps: true }
);

// 설계 4.7 인덱스
TaskSchema.index({ teamIds: 1, startDate: 1 });
TaskSchema.index({ assignees: 1, startDate: 1 });
TaskSchema.index({ status: 1, endDate: 1 }); // 크론(마감·지연)·팀 현황 집계용

export const Task = models.Task || model("Task", TaskSchema);
