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

// 분류 구분색 팔레트 — 색 미지정 분류에 order 순서로 자동 배정 (팀 ColorPicker 프리셋과 동일)
export const RC_PALETTE = ["#3182f6", "#f0466e", "#8b5cf6", "#12b3a6", "#e8951b", "#f97316", "#22c55e", "#64748b"];

// 기본 분류 시드(멱등·동시성 안전) + 레거시 자원(category enum)을 categoryId로 마이그레이션.
// 페이지 로드마다 호출해도 안전하다.
export async function ensureResourceCategories() {
  await connectDB();

  // 최초 1회만 시드 (컬렉션이 완전히 비었을 때). 이미 있으면 건너뜀 →
  // 사용자가 기본 분류를 삭제해도 다시 생성되지 않는다.
  // 동시성: name 유니크 인덱스 + ordered:false 로 중복은 무시.
  const count = await ResourceCategory.countDocuments();
  if (count === 0) {
    try {
      await ResourceCategory.insertMany(
        DEFAULTS.map((d) => ({ name: d.name, legacyKey: d.legacyKey, order: d.order, isActive: true, createdBy: null })),
        { ordered: false }
      );
    } catch (e: any) {
      if (e?.code !== 11000) console.error("[resourceCat] 시드 실패:", e);
    }
  }

  // 색 미지정 분류 → 팔레트에서 순서대로 배정 (멱등)
  const noColor = await ResourceCategory.find({ $or: [{ color: "" }, { color: { $exists: false } }] })
    .select("order").sort({ order: 1, name: 1 }).lean();
  if (noColor.length > 0) {
    const used = new Set(
      (await ResourceCategory.find({ color: { $nin: ["", null] } }).select("color").lean()).map((c: any) => c.color)
    );
    let cursor = 0;
    const ops = noColor.map((c: any) => {
      while (cursor < RC_PALETTE.length && used.has(RC_PALETTE[cursor])) cursor++;
      const color = RC_PALETTE[cursor % RC_PALETTE.length];
      cursor++;
      return { updateOne: { filter: { _id: c._id }, update: { $set: { color } } } };
    });
    await ResourceCategory.bulkWrite(ops);
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
