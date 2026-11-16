import crypto from "crypto";
import { put } from "@vercel/blob";
import { requireActiveUser, json } from "@/lib/api";
import { rateLimit } from "@/lib/rateLimit";
import { connectDB } from "@/lib/mongodb";
import { blobEnabled, ownPrefix } from "@/lib/assignmentPhotos";

// POST /api/assignments/upload — 과제 사진 1장 업로드 (multipart "file")
// 클라이언트에서 긴 변 2000px JPEG로 줄여 보내므로 보통 1MB 이하. 함수 본문 한도(4.5MB) 안쪽으로 제한.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;
  if (!blobEnabled()) return json({ error: "사진 저장소가 아직 연결되지 않았습니다. 관리자에게 문의해주세요." }, 503);

  await connectDB();
  const rl = await rateLimit(`asg-upload:${user.id}`, 120, 10 * 60 * 1000);
  if (!rl.ok) return json({ error: "업로드가 너무 잦아요. 잠시 후 다시 시도해주세요." }, 429);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return json({ error: "사진 파일이 없습니다." }, 400);
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return json({ error: "JPG·PNG·WEBP 사진만 올릴 수 있어요." }, 400);
  if (file.size > MAX_BYTES) return json({ error: "사진 용량이 너무 커요 (최대 4MB)." }, 400);

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const pathname = `${ownPrefix(user.id)}${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  await put(pathname, file, { access: "private", contentType: file.type, addRandomSuffix: false });

  return json({ pathname }, 201);
}
