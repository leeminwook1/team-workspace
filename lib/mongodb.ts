import mongoose from "mongoose";

// Vercel(서버리스)에서는 함수가 자주 재실행되므로, 연결을 전역에 캐싱해
// 매 요청마다 새 커넥션이 열리는 "커넥션 폭발"을 막는다. (설계문서 9장 참고)

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(".env.local 에 MONGODB_URI 를 설정하세요.");
}

// TypeScript용 전역 캐시 타입 선언
declare global {
  // eslint-disable-next-line no-var
  var _mongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } | undefined;
}

const cached = global._mongoose ?? { conn: null, promise: null };
global._mongoose = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI!, {
      bufferCommands: false,
      // dbName은 URI에 포함돼 있으면 생략 가능
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null; // 실패 시 다음 요청에서 재시도 가능하도록
    throw err;
  }

  return cached.conn;
}
