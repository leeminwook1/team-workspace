import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import { requireActiveUser, json } from "@/lib/api";

// GET /api/changes — 데이터 종류별 마지막 변경 시각 (자동 반영 폴링용, 초경량)
export async function GET() {
  const { error } = await requireActiveUser();
  if (error) return error;

  await connectDB();
  const doc: any = await mongoose.connection.db!.collection("meta").findOne({ _id: "changes" as any });
  if (doc) delete doc._id;
  return json({ changes: doc ?? {} });
}
