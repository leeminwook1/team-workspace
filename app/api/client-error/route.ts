import { z } from "zod";
import { requireActiveUser, json, limitWrites } from "@/lib/api";
import { alertAdmins, formatErrorAlert } from "@/lib/errorAlert";

// POST /api/client-error — 프론트 전역 에러 리포터 수신 → 관리자 텔레그램 알림.
// 사용자 화면에서 터진 JS 크래시·API 500을 관리자가 즉시 알 수 있게 한다.
// 로그인 사용자만 + 사용자당 rate limit + 종류별 서버 스로틀(10분)로 스팸 방지.

const bodySchema = z.object({
  kind: z.enum(["js-error", "unhandled-rejection", "api-500"]),
  message: z.string().min(1).max(500),
  detail: z.string().max(400).optional(), // stack 첫 줄 또는 URL·상태코드
  page: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const limited = await limitWrites(`clienterr:${user.id}`, 10, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ error: "잘못된 요청입니다." }, 400);

  const d = parsed.data;
  // 스로틀 키 — 같은 종류·같은 메시지는 10분에 1번만
  const key = `${d.kind}:${d.message.slice(0, 80)}`;
  await alertAdmins(key, formatErrorAlert({
    kind: d.kind === "api-500" ? "API 500" : d.kind === "js-error" ? "화면 오류" : "비동기 오류",
    message: d.message,
    detail: [d.detail, d.page && `📍 ${d.page}`].filter(Boolean).join("\n"),
    userName: user.name ?? undefined,
  }));

  return json({ ok: true });
}
