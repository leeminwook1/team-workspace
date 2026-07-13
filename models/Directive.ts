import { Schema, models, model } from "mongoose";

// 지시(하달) — 전사 역할(과장·부과장·서기·admin)이 특정 팀의 팀장 앞으로 내리는 할 일.
// 팀장 전용 인박스. 팀원은 지시함을 보지 못하고, 팀장이 '일정으로 등록'하면 달력에서 자기 몫을 본다.
const AssignmentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true }, // 재분배 대상(팀원)
    note: { type: String, default: "", trim: true, maxlength: 300 }, // 담당 내용
    done: { type: Boolean, default: false },
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
    readAt: { type: Date, default: null }, // 팀장(수신자)이 처음 열람한 시각 — 읽음 확인
    readBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    doneAt: { type: Date, default: null }, // 완료 처리 시각 — 처리 소요 리포트용
  },
  { timestamps: true }
);

DirectiveSchema.index({ teamId: 1, createdAt: -1 });

export const Directive = models.Directive || model("Directive", DirectiveSchema);
