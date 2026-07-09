import mongoose, { Schema, models, model } from "mongoose";

// 설계 4.1 — 전사 역할(orgRole) + 팀별 역할(teams[].role) 2축 구조
const TeamMembershipSchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    role: { type: String, enum: ["leader", "vice_leader", "member"], required: true },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    orgRole: {
      type: String,
      enum: ["admin", "manager", "deputy", "secretary"],
      default: undefined, // 일반 사용자는 전사 역할 없음
    },
    teams: { type: [TeamMembershipSchema], default: [] },
    status: {
      type: String,
      enum: ["pending", "active", "disabled"],
      default: "pending", // 가입 = 승인 대기 (설계 5.3)
      index: true,
    },
  },
  { timestamps: true }
);

export const User = models.User || model("User", UserSchema);
export type UserDoc = mongoose.InferSchemaType<typeof UserSchema>;
