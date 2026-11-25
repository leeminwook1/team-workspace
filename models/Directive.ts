import { Schema, models, model } from "mongoose";

// TODO — 과장이 과원에게 내리는 할 일. 지정된 과원(assignments)은 TODO 메뉴에서 자기 몫을 보고
// 완료 체크한다. 과장은 상태·배분을 관리하고 필요하면 달력 일정으로 등록한다.
const AssignmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // 받는 과원
    note: { type: String, default: "", trim: true, maxlength: 300 }, // 담당 내용
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null }, // 과원이 완료 체크한 시각
    readAt: { type: Date, default: null }, // 과원이 처음 열람한 시각 — 읽음 확인
    taskId: { type: Schema.Types.ObjectId, ref: "Task", default: null }, // 일정으로 등록 시 연결
  },
  { _id: true }
);

const DirectiveSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 2000 },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true }, // 대상 팀(팀장 수신)
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }, // 발신자(전사 역할)
    dueDate: { type: Date, default: null }, // 마감(선택)
    priority: { type: String, enum: ["low", "normal", "high", "urgent"], default: "normal" },
    // 상태는 업무와 동일 어휘 재사용 (todo=대기, in_progress=진행중, done=완료, hold=보류)
    status: { type: String, enum: ["todo", "in_progress", "done", "hold"], default: "todo" },
    assignments: { type: [AssignmentSchema], default: [] }, // 팀장의 팀원 재분배
    convertedTaskId: { type: Schema.Types.ObjectId, ref: "Task", default: null }, // 지시 전체를 일정으로 등록 시 연결(중복 방지)
    readAt: { type: Date, default: null }, // (이전 방식) 과장 열람 시각 — 지금은 과원별 assignments.readAt
    readBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    doneAt: { type: Date, default: null }, // 완료 처리 시각 — 처리 소요 리포트용
  },
  { timestamps: true }
);

DirectiveSchema.index({ teamId: 1, createdAt: -1 });
DirectiveSchema.index({ status: 1, dueDate: 1 }); // 크론 마감 알림용
DirectiveSchema.index({ "assignments.userId": 1, status: 1 }); // 과원별 받은 TODO

export const Directive = models.Directive || model("Directive", DirectiveSchema);
