import { del } from "@vercel/blob";

// 과제 사진 저장 규칙 — Vercel Blob(private store)
// pathname: assignments/u/<업로더 userId>/<시각>-<랜덤>.jpg
// 업로드 직후엔 어느 과제에도 속하지 않으므로, 저장 시 "본인 업로드분이거나 이미 이 문서에 있던 사진"만 허용한다.

export const PHOTO_PREFIX = "assignments/u/";
export const MAX_PHOTOS = 12; // 과제 레퍼런스·제출물 각각 최대 장수

export function blobEnabled() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export function ownPrefix(userId: string) {
  return `${PHOTO_PREFIX}${userId}/`;
}

type PhotoIn = { pathname: string; caption?: string };

/** 클라이언트가 보낸 사진 목록 정제 — 위조 pathname(남의 사진·다른 경로) 차단 */
export function sanitizePhotos(input: unknown, userId: string, existing: PhotoIn[] = []): PhotoIn[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_PHOTOS) return null;
  const allowedExisting = new Set(existing.map((p) => p.pathname));
  const out: PhotoIn[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const pathname = typeof raw?.pathname === "string" ? raw.pathname : "";
    if (!pathname || seen.has(pathname)) continue;
    if (!/^[\w\-/.]+$/.test(pathname) || pathname.includes("..")) return null;
    if (!pathname.startsWith(ownPrefix(userId)) && !allowedExisting.has(pathname)) return null;
    seen.add(pathname);
    out.push({ pathname, caption: typeof raw?.caption === "string" ? raw.caption.trim().slice(0, 300) : "" });
  }
  return out;
}

/** 더 이상 참조되지 않는 사진 삭제 — 실패해도 본작업은 막지 않음 */
export async function deletePhotos(pathnames: string[]) {
  if (pathnames.length === 0 || !blobEnabled()) return;
  try {
    await del(pathnames);
  } catch (e) {
    console.error("[assignment photos] 삭제 실패:", e);
  }
}

/** 이전 목록에는 있었지만 새 목록에서 빠진 사진 */
export function removedPhotos(before: PhotoIn[], after: PhotoIn[]) {
  const keep = new Set(after.map((p) => p.pathname));
  return before.map((p) => p.pathname).filter((p) => !keep.has(p));
}
