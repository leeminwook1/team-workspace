import { Schema, models, model } from "mongoose";

// 과제 — 팀장이 레퍼런스 사진 + 컨셉 설명을 올리면 팀원이 그에 맞춰 촬영해 제출한다.
// 사진은 Vercel Blob(private)에 저장하고, 여기엔 pathname만 둔다 (열람은 /api/assignments/photo 경유).
const PhotoSchema = new Schema(
  {
    pathname: { type: String, required: true },
    caption: { type: String, default: "", trim: true, maxlength: 300 },
  },
  { _id: false }
);

const AssignmentSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    concept: { type: String, default: "", maxlength: 3000 }, // 컨셉·촬영 가이드
    references: { type: [PhotoSchema], default: [] }, // 레퍼런스 사진
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dueDate: { type: Date, default: null }, // 제출 마감
    closed: { type: Boolean, default: false }, // 마감 처리되면 제출·수정 불가
  },
  { timestamps: true }
);

AssignmentSchema.index({ teamId: 1, createdAt: -1 });
AssignmentSchema.index({ "references.pathname": 1 });

export const Assignment = models.Assignment || model("Assignment", AssignmentSchema);

// 제출물 — 과제당 1인 1건 (수정은 같은 문서를 갱신)
const SubmissionSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    photos: { type: [PhotoSchema], default: [] },
    note: { type: String, default: "", maxlength: 2000 }, // 촬영 의도·설명
    feedback: { type: String, default: "", maxlength: 2000 }, // 팀장 피드백
    feedbackBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    feedbackAt: { type: Date, default: null },
  },
  { timestamps: true }
);

SubmissionSchema.index({ assignmentId: 1, userId: 1 }, { unique: true });
SubmissionSchema.index({ "photos.pathname": 1 });

export const Submission = models.Submission || model("Submission", SubmissionSchema);
