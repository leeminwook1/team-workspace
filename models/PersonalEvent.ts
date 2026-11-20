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
    // 매일·매주·격주·매월·d<N>(N일마다)·w<N>(N주마다)·dates(날짜 지정) — lib/repeatRule
    repeatFreq: { type: String, default: null, match: /^(daily|weekly|biweekly|monthly|dates|d\d{1,2}|w\d{1,2})$/ },
  },
  { timestamps: true }
);

PersonalEventSchema.index({ userId: 1, startDate: 1 });
PersonalEventSchema.index({ recurrenceId: 1, startDate: 1 });

export const PersonalEvent = models.PersonalEvent || model("PersonalEvent", PersonalEventSchema);
