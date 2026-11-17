import { Schema, models, model } from "mongoose";

// 장비 세트 — 자주 같이 빌리는 장비 묶음 (예: "세트 1번" = 바디 + 렌즈 + 배터리 + 메모리).
// 예약할 때 세트를 고르면 구성 장비가 한 번에 선택된다. 예약 자체는 장비별로 따로 잡힌다.
const ResourceSetSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    resourceIds: [{ type: Schema.Types.ObjectId, ref: "Resource" }],
    note: { type: String, default: "", maxlength: 200 },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const ResourceSet = models.ResourceSet || model("ResourceSet", ResourceSetSchema);
