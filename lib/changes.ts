import mongoose from "mongoose";
import { connectDB } from "./mongodb";

// 변경 신호 — 데이터가 바뀔 때 종류별 타임스탬프를 meta 컬렉션에 기록.
// 클라이언트는 /api/changes 를 짧은 주기로 확인하다가, 바뀐 종류가 있을 때만 실제 데이터를 다시 불러온다.
// kind: task | directive | event | reservation | user | personal | team | category | resource | notice | feedback

export async function touchChanged(kind: string) {
  try {
    await connectDB();
    await mongoose.connection.db!.collection("meta").updateOne(
      { _id: "changes" as any },
      { $set: { [kind]: Date.now() } },
      { upsert: true }
    );
  } catch (e) {
    // 신호 실패가 본작업을 막으면 안 된다 (다음 변경 때 다시 기록됨)
    console.error("[changes] touch 실패:", e);
  }
}
