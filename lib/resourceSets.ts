import mongoose from "mongoose";

// 장비 세트 입력 검증 (생성·수정 공용)
export function parseSetBody(body: any) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 40) return { error: "세트 이름을 입력하세요 (40자 이내)." };
  const ids: string[] = Array.isArray(body?.resourceIds) ? body.resourceIds.filter((x: any) => typeof x === "string" && mongoose.isValidObjectId(x)) : [];
  const uniq = Array.from(new Set(ids));
  if (uniq.length < 2) return { error: "장비를 2개 이상 골라주세요." };
  if (uniq.length > 30) return { error: "세트는 장비 30개까지예요." };
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 200) : "";
  return { name, resourceIds: uniq, note };
}
