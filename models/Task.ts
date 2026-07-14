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
    // 반복 규칙 — 크론이 오커런스를 이어서 생성(롤링 연장)할 때 사용
    repeatFreq: { type: String, enum: ["daily", "weekly", "biweekly", "monthly", null], default: null },
    repeatUntil: { type: Date, default: null }, // 반복 종료(그날 포함 다음날 자정)

    status: { type: String, enum: ["todo", "in_progress", "done", "hold"], default: "todo" },
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },

    tags: [{ type: String }],
    location: { type: String, default: "" },

    deletedAt: { type: Date, default: null }, // 소프트 삭제 — 30일 내 복구 가능, 이후 크론이 완전 삭제
  },
  { timestamps: true }
);

// 설계 4.7 인덱스
TaskSchema.index({ teamIds: 1, startDate: 1 });
TaskSchema.index({ assignees: 1, startDate: 1 });
TaskSchema.index({ status: 1, endDate: 1 }); // 크론(마감·지연)·팀 현황 집계용
TaskSchema.index({ deletedAt: 1 }, { sparse: true }); // 휴지통·퍼지용

// 소프트 삭제 기본 필터 — deletedAt 있는 문서는 모든 조회에서 제외
// (휴지통 조회처럼 삭제분이 필요하면 쿼리에 deletedAt 조건을 직접 넣으면 이 필터를 건너뛴다)
TaskSchema.pre(["find", "findOne", "findOneAndUpdate", "countDocuments"], function (next) {
  const q = this.getQuery();
  if (!("deletedAt" in q)) this.where({ deletedAt: null });
  next();
});

export const Task = models.Task || model("Task", TaskSchema);
