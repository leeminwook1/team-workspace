import { Schema, models, model } from "mongoose";

// 피드백 게시판 — 써보면서 느낀 기능 제안·버그·개선사항을 누구나 올린다.
// 처리(상태 변경)는 최고관리자. 공감(votes)으로 수요를 가늠한다.
const FeedbackCommentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const FeedbackSchema = new Schema(
  {
    type: { type: String, enum: ["feature", "bug", "improve"], required: true }, // 기능 제안 | 버그 | 개선
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: "", maxlength: 3000 },
    // open=접수, in_progress=진행중, done=반영 완료, declined=반려
    status: { type: String, enum: ["open", "in_progress", "done", "declined"], default: "open" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    votes: { type: [Schema.Types.ObjectId], ref: "User", default: [] }, // 공감한 사용자
    comments: { type: [FeedbackCommentSchema], default: [] },
  },
  { timestamps: true }
);

FeedbackSchema.index({ status: 1, createdAt: -1 });
FeedbackSchema.index({ createdAt: -1 }); // 목록 기본 정렬(최신순)

export const Feedback = models.Feedback || model("Feedback", FeedbackSchema);
