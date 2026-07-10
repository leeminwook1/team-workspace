import { connectDB } from "./mongodb";
import { ResourceCategory } from "@/models/ResourceCategory";
import { Resource } from "@/models/Resource";

// 기본 장비 분류 (기존 enum과 1:1 매핑)
const DEFAULTS = [
  { name: "스튜디오", legacyKey: "studio", order: 0 },
  { name: "촬영장비", legacyKey: "camera", order: 1 },
  { name: "공연장", legacyKey: "venue", order: 2 },
  { name: "음향장비", legacyKey: "audio", order: 3 },
  { name: "편집실", legacyKey: "edit", order: 4 },
  { name: "기타", legacyKey: "etc", order: 5 },
];

// 기본 분류 시드(멱등·동시성 안전) + 레거시 자원(category enum)을 categoryId로 마이그레이션.
// 페이지 로드마다 호출해도 안전하다.
export async function ensureResourceCategories() {
  await connectDB();

  // upsert 시드 — name 유니크 기준, 동시 호출에도 중복 안 생김
  for (const d of DEFAULTS) {
    await ResourceCategory.updateOne(
      { name: d.name },
      { $setOnInsert: { legacyKey: d.legacyKey, order: d.order, isActive: true, createdBy: null } },
      { upsert: true }
    );
  }

  // categoryId 없는 레거시 자원 → legacyKey 매칭으로 채움
  const legacy = await Resource.find({ $or: [{ categoryId: null }, { categoryId: { $exists: false } }] })
    .select("category")
    .lean();
  if (legacy.length > 0) {
    const cats = await ResourceCategory.find().select("legacyKey").lean();
    const byKey = new Map(cats.map((c: any) => [c.legacyKey, c._id]));
    const etc = byKey.get("etc") ?? null;
    const ops = legacy.map((r: any) => ({
      updateOne: { filter: { _id: r._id }, update: { $set: { categoryId: byKey.get(r.category) ?? etc } } },
    }));
    if (ops.length > 0) await Resource.bulkWrite(ops);
  }
}
