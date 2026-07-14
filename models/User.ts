import mongoose, { Schema, models, model } from "mongoose";

// 단일 역할 체계 — 역할 하나 + 소속 팀 1개 (1인 1팀)
// 전사 역할(admin/manager/deputy/secretary): 전체 팀 조회, teamId 없음(null)
// 팀 역할(leader/vice_leader/member): teamId 필수
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ["admin", "manager", "deputy", "secretary", "leader", "vice_leader", "member"],
      default: "member",
    },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", default: null },
    status: {
      type: String,
      enum: ["pending", "active", "disabled"],
      default: "pending", // 가입 = 승인 대기
      index: true,
    },
    // 홈 위젯 배치 — 순서대로 렌더, size: 1(반폭)|2(전폭). 비어 있으면 기본 배치 사용
    homeLayout: {
      type: [{ _id: false, id: { type: String, required: true }, size: { type: Number, default: 1 } }],
      default: undefined,
    },
    // 텔레그램 알림 — 봇과 대화하는 챗 ID (빈 문자열 = 미연동)
    telegramChatId: { type: String, default: "" },
    // 텔레그램 알림 수신 설정 — false인 항목은 텔레그램 발송 생략 (앱 내 알림은 항상 생성)
    notifyPrefs: {
      assign: { type: Boolean, default: true }, // 담당자 배정 (업무·행사)
      due: { type: Boolean, default: true }, // 오늘 마감 리마인더
      late: { type: Boolean, default: true }, // 지연(마감 지난) 업무 리마인더
      directive: { type: Boolean, default: true }, // 지시(TODO)
      equip: { type: Boolean, default: true }, // 장비 예약·반납
    },
    // 텔레그램 연동 코드 — 설정에서 발급, 봇에게 /연동 <코드> 전송으로 챗 ID 자동 연결 (10분 유효)
    tgLinkCode: { type: String, default: "" },
    tgLinkCodeExp: { type: Date, default: null },
  },
  { timestamps: true }
);

UserSchema.index({ teamId: 1, role: 1, status: 1 }); // 팀장·팀원 조회(알림 대상, 팀 현황)용

export const User = models.User || model("User", UserSchema);
export type UserDoc = mongoose.InferSchemaType<typeof UserSchema>;
