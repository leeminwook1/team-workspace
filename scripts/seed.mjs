// DB 시드: 최고관리자 1명 + 7개 팀 + 샘플 자원 (설계문서 기준)
// 실행: npm run seed
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envText = readFileSync(join(root, ".env.local"), "utf8");
const m = envText.match(/^MONGODB_URI\s*=\s*"?([^"\r\n]+)"?/m);
if (!m) throw new Error(".env.local 에서 MONGODB_URI 를 찾지 못했습니다.");
const uri = m[1];

const ADMIN = { email: "admin@team.com", password: "admin1234!", name: "최고관리자" };

const TEAMS = [
  { name: "사진", slug: "photo", color: "#e8951b" },
  { name: "영상", slug: "video", color: "#f0466e" },
  { name: "디자인", slug: "design", color: "#8b5cf6" },
  { name: "문화예술", slug: "culture", color: "#12b3a6" },
  { name: "공연예술", slug: "perform", color: "#3182f6" },
  { name: "방송예술", slug: "broadcast", color: "#f97316" },
  { name: "음향", slug: "sound", color: "#22c55e" },
];

const CATEGORIES = [
  { name: "회의", color: "#3182f6" },
  { name: "촬영", color: "#f0466e" },
  { name: "편집", color: "#8b5cf6" },
  { name: "행사", color: "#12b3a6" },
  { name: "외부일정", color: "#f97316" },
  { name: "기타", color: "#8b95a1" },
];

const RESOURCES = [
  { name: "스튜디오 A", category: "studio" },
  { name: "스튜디오 B", category: "studio" },
  { name: "카메라 1호 (시네마)", category: "camera" },
  { name: "카메라 2호 (미러리스)", category: "camera" },
  { name: "공연장 (대강당)", category: "venue" },
  { name: "음향 믹서 세트", category: "audio" },
  { name: "편집실 1", category: "edit" },
];

const client = new MongoClient(uri);
await client.connect();
const db = client.db(); // URI의 workspace_db
console.log("연결됨:", db.databaseName);

const now = new Date();

// 1) 팀 upsert (slug 기준 — 재실행해도 중복 안 생김)
for (const t of TEAMS) {
  await db.collection("teams").updateOne(
    { slug: t.slug },
    {
      $setOnInsert: {
        ...t,
        description: "",
        isActive: true,
        createdAt: now,
        updatedAt: now,
        __v: 0,
      },
    },
    { upsert: true }
  );
}
console.log(`팀 ${TEAMS.length}개 준비 완료`);

// 2) 관리자 계정 (email 기준 upsert)
const existing = await db.collection("users").findOne({ email: ADMIN.email });
if (!existing) {
  const passwordHash = await bcrypt.hash(ADMIN.password, 10);
  await db.collection("users").insertOne({
    email: ADMIN.email,
    passwordHash,
    name: ADMIN.name,
    role: "admin",
    teamId: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
    __v: 0,
  });
  console.log(`관리자 생성: ${ADMIN.email} / ${ADMIN.password}`);
} else {
  console.log(`관리자 이미 존재: ${ADMIN.email} (비밀번호 변경 안 함)`);
}

// 3) 샘플 자원 (name 기준 upsert)
for (const r of RESOURCES) {
  await db.collection("resources").updateOne(
    { name: r.name },
    {
      $setOnInsert: {
        ...r,
        ownerTeamId: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        __v: 0,
      },
    },
    { upsert: true }
  );
}
console.log(`자원 ${RESOURCES.length}개 준비 완료`);

// 3.5) 일정 카테고리 (name 기준 upsert)
for (const cat of CATEGORIES) {
  await db.collection("categories").updateOne(
    { name: cat.name },
    { $setOnInsert: { ...cat, isActive: true, createdAt: now, updatedAt: now, __v: 0 } },
    { upsert: true }
  );
}
console.log(`카테고리 ${CATEGORIES.length}개 준비 완료`);

// 4) 인덱스 (설계 4.7)
await db.collection("users").createIndex({ email: 1 }, { unique: true });
await db.collection("users").createIndex({ status: 1 });
await db.collection("teams").createIndex({ slug: 1 }, { unique: true });
await db.collection("tasks").createIndex({ teamId: 1, startDate: 1 });
await db.collection("tasks").createIndex({ assignees: 1, startDate: 1 });
await db.collection("reservations").createIndex({ resourceId: 1, startAt: 1, endAt: 1 });
console.log("인덱스 생성 완료");

const counts = {};
for (const c of ["users", "teams", "resources", "tasks", "reservations"]) {
  counts[c] = await db.collection(c).countDocuments();
}
console.log("컬렉션 현황:", JSON.stringify(counts));

await client.close();
console.log("✅ 시드 완료");
