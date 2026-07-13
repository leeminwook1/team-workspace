import { Schema, models, model } from "mongoose";

// 설계 4.2 — 팀은 DB로 관리 (하드코딩 금지, 확장 가능)
const TeamSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    color: { type: String, required: true, default: "#3182f6" },
    description: { type: String, default: "" },
    // 팀 텔레그램 그룹방 챗 ID — 등록하면 매일 아침 팀 브리핑 발송 (봇을 그룹에 초대 후 /챗아이디로 확인)
    telegramChatId: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Team = models.Team || model("Team", TeamSchema);
