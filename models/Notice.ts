import { Schema, models, model } from "mongoose";

// 공지사항 — 전사 역할(admin·과장·부과장·서기)이 올리는 전체 공지.
// 고정(pinned) 공지는 목록 맨 위. readBy로 사용자별 안읽음 배지를 계산한다.
const NoticeSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 5000 },
    pinned: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    readBy: { type: [Schema.Types.ObjectId], ref: "User", default: [] }, // 읽은 사용자 — 안읽음 배지용
  },
  { timestamps: true }
);

NoticeSchema.index({ pinned: -1, createdAt: -1 });

export const Notice = models.Notice || model("Notice", NoticeSchema);
