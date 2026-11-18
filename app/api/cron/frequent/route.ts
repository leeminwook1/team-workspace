import { connectDB } from "@/lib/mongodb";
import { json } from "@/lib/api";
import { isRetiredDeployment } from "@/lib/deployment";
import { sendEveningBriefs, sendWrapPrompts } from "@/lib/timedNotices";

// GET /api/cron/frequent — 30분마다 (GitHub Actions .github/workflows/cron-frequent.yml 이 호출).
// Vercel 무료 요금제 크론은 하루 1번뿐이라 시간 맞춤 알림은 외부에서 부른다. Authorization: Bearer <CRON_SECRET> 필수.
//  · 오전 촬영 전날 저녁 안내 (19~22시 사이 실행분)
//  · 촬영 끝나고 30분 뒤 진행 버튼·장비 반납 체크리스트
// 각 알림은 일정에 보낸 표시를 남겨, 늦거나 겹쳐 불려도 한 번만 간다.
export async function GET(req: Request) {
  if (isRetiredDeployment(req.headers.get("host"))) return json({ skipped: "retired deployment" });
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  } else if (process.env.NODE_ENV === "production") {
    return json({ error: "CRON_SECRET이 설정되지 않았습니다." }, 401); // 외부에서 불리는 경로 — 시크릿 없이 열지 않는다
  }
  await connectDB();
  const eve = await sendEveningBriefs();
  const wrap = await sendWrapPrompts();
  return json({ ok: true, eveningBriefs: eve, wrapPrompts: wrap });
}
