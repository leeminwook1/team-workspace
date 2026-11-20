import { Schema, models, model } from "mongoose";

// 식순·타임테이블 한 줄 (촬영 등 일부 업무) — 행사 식순과 동일 구조
const TaskProgramSchema = new Schema(
  {
    time: { type: String, default: "", maxlength: 40 },
    title: { type: String, required: true, maxlength: 200 },
    note: { type: String, default: "", maxlength: 200 },
    must: { type: Boolean, default: false }, // ⭐ 필수 컷
  },
  { _id: true }
);

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
    // 매일·매주·격주·매월·d<N>(N일마다)·w<N>(N주마다)·dates(날짜 지정 — 크론 연장 없음) — lib/repeatRule
    repeatFreq: { type: String, default: null, match: /^(daily|weekly|biweekly|monthly|dates|d\d{1,2}|w\d{1,2})$/ },
    repeatUntil: { type: Date, default: null }, // 반복 종료(그날 포함 다음날 자정)

    status: { type: String, enum: ["todo", "in_progress", "done", "hold"], default: "todo" },
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },

    tags: [{ type: String }],
    location: { type: String, default: "" },

    // 식순·타임테이블 — 촬영 등 진행 순서가 있는 업무에서만 사용 (없으면 표시 안 함)
    program: { type: [TaskProgramSchema], default: [] },

    // 참석 확인 (모임) — 켜면 과원 전체(targets)에게 참석/불참/미정 응답을 받는다 (lib/rsvp.ts)
    rsvp: {
      on: { type: Boolean, default: false },
      deadline: { type: Date, default: null }, // 응답 마감 (이날 아침 미응답자 재알림)
      targets: [{ type: Schema.Types.ObjectId, ref: "User" }],
      responses: [{
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        status: { type: String, enum: ["yes", "no", "maybe"], required: true },
        reason: { type: String, default: "", maxlength: 200 },
        at: { type: Date, default: Date.now },
      }],
      remindedAt: { type: Date, default: null },
      // 보낸 텔레그램 메시지 — 누가 응답하면 모두의 메시지를 현황으로 고쳐 쓴다
      tgMessages: [{
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        chatId: { type: String },
        messageId: { type: Number },
      }],
    },

    // 촬영 진행 관리 — 촬영 → 백업 → 셀렉 → 보정 → 보고 (lib/pipeline.ts). 각 단계 완료 시각·처리자
    pipeline: {
      on: { type: Boolean, default: false },
      steps: {
        shoot: { type: Date, default: null },
        backup: { type: Date, default: null },
        select: { type: Date, default: null },
        retouch: { type: Date, default: null },
        report: { type: Date, default: null },
      },
      stepBy: {
        shoot: { type: Schema.Types.ObjectId, ref: "User", default: null },
        backup: { type: Schema.Types.ObjectId, ref: "User", default: null },
        select: { type: Schema.Types.ObjectId, ref: "User", default: null },
        retouch: { type: Schema.Types.ObjectId, ref: "User", default: null },
        report: { type: Schema.Types.ObjectId, ref: "User", default: null },
      },
      reportDue: { type: Date, default: null },
      selectDue: { type: Date, default: null }, // 셀렉 마감 — 바로 못 할 때 담당자가 정해두는 기한 (선택)
    },

    // 시간 맞춤 알림 보낸 표시 (중복 방지) — lib/timedNotices.ts
    notice: {
      eveAt: { type: Date, default: null }, // 오전 촬영 전날 저녁 안내
      wrapAt: { type: Date, default: null }, // 촬영 끝난 뒤 진행·반납 버튼
    },

    deletedAt: { type: Date, default: null }, // 소프트 삭제 — 30일 내 복구 가능, 이후 크론이 완전 삭제
  },
  { timestamps: true }
);

// 설계 4.7 인덱스
TaskSchema.index({ teamIds: 1, startDate: 1 });
TaskSchema.index({ assignees: 1, startDate: 1 });
TaskSchema.index({ assignees: 1, endDate: 1 }); // 내 담당(홈·iCal·/완료) — endDate 정렬
TaskSchema.index({ status: 1, endDate: 1 }); // 크론(마감·지연)·팀 현황 집계용
TaskSchema.index({ startDate: 1, endDate: 1 }); // 중복감지(팀무관 기간겹침)·기간 목록 스캔
TaskSchema.index({ recurrenceId: 1, startDate: 1 }); // 반복 롤링 연장 조회
TaskSchema.index({ "rsvp.on": 1, "rsvp.targets": 1, startDate: 1 }); // 응답 대기 모임 조회
TaskSchema.index({ deletedAt: 1 }, { sparse: true }); // 휴지통·퍼지용
TaskSchema.index({ "pipeline.on": 1, endDate: 1 }); // 촬영 진행 보드·통계

// 소프트 삭제 기본 필터 — deletedAt 있는 문서는 모든 조회에서 제외
// (휴지통 조회처럼 삭제분이 필요하면 쿼리에 deletedAt 조건을 직접 넣으면 이 필터를 건너뛴다)
TaskSchema.pre(["find", "findOne", "findOneAndUpdate", "countDocuments"], function (next) {
  const q = this.getQuery();
  if (!("deletedAt" in q)) this.where({ deletedAt: null });
  next();
});

export const Task = models.Task || model("Task", TaskSchema);
