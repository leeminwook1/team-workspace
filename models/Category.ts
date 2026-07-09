import { Schema, models, model } from "mongoose";

// 일정 카테고리 (예: 회의, 촬영, 편집, 행사 …) — 관리자에서 관리
const CategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    color: { type: String, required: true, default: "#8b95a1" },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Category = models.Category || model("Category", CategorySchema);
