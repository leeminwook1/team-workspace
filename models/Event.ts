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

// 식순·타임테이블 한 줄 — 시간(자유 텍스트)·순서명·담당/비고. 입력 순서가 곧 진행 순서.
const EventProgramSchema = new Schema(
  {
    time: { type: String, default: "", trim: true, maxlength: 40 }, // "14:00" 또는 "14:00–14:10" 등 자유 입력
    title: { type: String, required: true, trim: true, maxlength: 200 },
    note: { type: String, default: "", trim: true, maxlength: 200 }, // 담당·비고
    must: { type: Boolean, default: false }, // ⭐ 필수 컷 — 꼭 찍어야 하는 순간
  },
  { _id: true }
);

// 포지션 — 촬영 당일 서 있는 위치(중앙·상수·하수·부감·3층 등)와 그 자리를 맡은 사람
const EventPositionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 30 },
    userIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    note: { type: String, default: "", trim: true, maxlength: 200 }, // 역할 메모 (예: 전체 와이드, 출연자 등·퇴장)
  },
  { _id: true }
);

const EventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 2000 },
    teamIds: [{ type: Schema.Types.ObjectId, ref: "Team" }], // 참여 팀(태깅)
    managerId: { type: Schema.Types.ObjectId, ref: "User", default: null }, // (사용 안 함 — 사진과는 할 일에만 담당자)
    eventDate: { type: Date, default: null }, // 행사일 → D-day
    location: { type: String, default: "" },
    meetTime: { type: String, default: "" }, // 집합 시간 "HH:MM"
    meetPlace: { type: String, default: "", maxlength: 120 }, // 집합 장소
    // 알아야 할 내용 — 비어 있는 항목은 화면에 표시하지 않는다. 자유 메모는 description
    brief: {
      dress: { type: String, default: "", maxlength: 300 }, // 복장
      caution: { type: String, default: "", maxlength: 1000 }, // 촬영 주의 (플래시 금지·촬영 금지 구간 등)
      delivery: { type: String, default: "", maxlength: 500 }, // 납품 (마감·컷 수·규격)
      contact: { type: String, default: "", maxlength: 300 }, // 현장 연락처
    },
    positions: { type: [EventPositionSchema], default: [] },
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },
    items: { type: [EventItemSchema], default: [] }, // 행사 안의 투두(칸반 카드)
    program: { type: [EventProgramSchema], default: [] }, // 식순·타임테이블
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    closedAt: { type: Date, default: null }, // 행사 종료(보관) 시각 — null이면 진행 중
    deletedAt: { type: Date, default: null }, // 소프트 삭제 — 30일 내 복구 가능, 이후 크론이 완전 삭제

  },
  { timestamps: true }
);

EventSchema.index({ eventDate: 1 });
EventSchema.index({ "positions.userIds": 1, eventDate: 1 }); // 내 캘린더·당일 알림
EventSchema.index({ "items.assigneeId": 1 });

export const Event = models.Event || model("Event", EventSchema);
