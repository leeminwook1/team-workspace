import { Schema, models, model } from "mongoose";
import { ABSENCE_TYPES } from "@/lib/absenceTypes";

// 부재·휴가 — 연차/반차/출장/교육. 날짜 단위(시작~마지막 날 포함).
const AbsenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", default: null }, // 등록 시점 소속 (팀 범위 조회용)
    type: { type: String, enum: ABSENCE_TYPES, default: "vacation" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true }, // 마지막 날 포함
    note: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

AbsenceSchema.index({ teamId: 1, startDate: 1 });
AbsenceSchema.index({ userId: 1, startDate: 1 });

export const Absence = models.Absence || model("Absence", AbsenceSchema);
