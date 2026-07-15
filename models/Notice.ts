import { Schema, models, model } from "mongoose";

// 공지사항 — 전사 역할(admin·과장·부과장·서기)이 올리는 전체 공지.
// 고정(pinned) 공지는 목록 맨 위. 안읽음은 User.lastNoticeReadAt < createdAt 로 계산(무제한 배열 미사용).
const NoticeSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 5000 },
    pinned: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

NoticeSchema.index({ pinned: -1, createdAt: -1 });

export const Notice = models.Notice || model("Notice", NoticeSchema);
