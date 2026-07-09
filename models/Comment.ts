import { Schema, models, model } from "mongoose";

// 업무 댓글 (설계 4.4)
const CommentSchema = new Schema(
  {
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

export const Comment = models.Comment || model("Comment", CommentSchema);
