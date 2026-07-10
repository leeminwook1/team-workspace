import { Schema, models, model } from "mongoose";

// 장비 분류 (카메라·음향·조명 등) — 관리자가 자유롭게 추가/수정. 자원이 이 분류에 속한다.
const ResourceCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    legacyKey: { type: String, default: "" }, // 기존 enum 마이그레이션용(studio/camera/…)
    order: { type: Number, default: 0 }, // 표시 순서
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, // 시스템 시드는 null
  },
  { timestamps: true }
);

export const ResourceCategory = models.ResourceCategory || model("ResourceCategory", ResourceCategorySchema);
