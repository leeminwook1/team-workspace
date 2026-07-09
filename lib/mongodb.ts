import mongoose from "mongoose";

// Vercel(서버리스)에서는 함수가 자주 재실행되므로, 연결을 전역에 캐싱해
// 매 요청마다 새 커넥션이 열리는 "커넥션 폭발"을 막는다. (설계문서 9장 참고)
//
// 주의: MONGODB_URI 존재 여부는 반드시 connectDB() "호출 시점"에 체크한다.
// 모듈 최상단(import 시점)에서 throw하면 Next.js 빌드의 "페이지 데이터 수집"
// 단계에서 이 파일을 import하는 것만으로 빌드 전체가 죽는다
// (빌드 서버엔 아직 환경변수가 없을 수 있음 — 예: Vercel에 env 등록 전).

// TypeScript용 전역 캐시 타입 선언
declare global {
  // eslint-disable-next-line no-var
  var _mongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } | undefined;
}

const cached = global._mongoose ?? { conn: null, promise: null };
global._mongoose = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI 환경변수가 설정되지 않았습니다. (.env.local 또는 Vercel 프로젝트 설정)");
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
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
