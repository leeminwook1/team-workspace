import { Schema, models, model } from "mongoose";

// 설계 4.2 — 팀은 DB로 관리 (하드코딩 금지, 확장 가능)
const TeamSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    color: { type: String, required: true, default: "#3182f6" },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Team = models.Team || model("Team", TeamSchema);
