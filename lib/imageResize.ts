// 브라우저에서 사진을 업로드 전에 줄인다 — 원본(폰 사진 5~15MB)을 긴 변 2000px JPEG로.
// 점검·감상용으로 충분한 화질이면서 함수 본문 한도(4.5MB)와 저장 용량을 지킨다.
// EXIF 회전은 createImageBitmap의 imageOrientation으로 반영.

const MAX_EDGE = 2000;
const QUALITY = 0.86;

export async function resizeImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`"${file.name}" 은(는) 열 수 없는 형식이에요. JPG·PNG로 저장해서 올려주세요.`);
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지 처리를 지원하지 않는 브라우저예요.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("이미지 변환에 실패했어요.");
  return blob;
}

export const photoUrl = (pathname: string) => `/api/assignments/photo?p=${encodeURIComponent(pathname)}`;
