import { Schema, models, model } from "mongoose";

// 개인 캘린더 일정 — 본인만 등록·수정·삭제.
// 열람: 본인 + 같은 팀의 "팀장" + 최고관리자(admin)만 (부팀장·과장·부과장·서기 불가)
const PersonalEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    memo: { type: String, default: "" },
    location: { type: String, default: "" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    allDay: { type: Boolean, default: true },
    // 반복 — 생성 시 종료일까지 회차를 모두 만들어 둔다 (최대 1년). 같은 시리즈는 recurrenceId로 묶음
    recurrenceId: { type: Schema.Types.ObjectId, default: null },
    repeatFreq: { type: String, enum: ["daily", "weekly", "biweekly", "monthly", null], default: null },
  },
  { timestamps: true }
);

PersonalEventSchema.index({ userId: 1, startDate: 1 });
PersonalEventSchema.index({ recurrenceId: 1, startDate: 1 });

export const PersonalEvent = models.PersonalEvent || model("PersonalEvent", PersonalEventSchema);
