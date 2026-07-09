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

export const Task = models.Task || model("Task", TaskSchema);
