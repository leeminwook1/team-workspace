import { Schema, models, model } from "mongoose";

// 설계 4.6 — 공유 자원 (스튜디오/장비/공연장 등)
const ResourceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["studio", "camera", "venue", "audio", "edit", "etc"],
      default: "etc",
    }, // (레거시) 마이그레이션 후 categoryId 사용
    categoryId: { type: Schema.Types.ObjectId, ref: "ResourceCategory", default: null },
    ownerTeamId: { type: Schema.Types.ObjectId, ref: "Team", default: null }, // null = 공용
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Resource = models.Resource || model("Resource", ResourceSchema);
