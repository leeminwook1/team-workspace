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
  },
  { timestamps: true }
);

export const User = models.User || model("User", UserSchema);
export type UserDoc = mongoose.InferSchemaType<typeof UserSchema>;
