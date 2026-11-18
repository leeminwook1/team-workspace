import { connectDB } from "@/lib/mongodb";
import { requireActiveUser, json } from "@/lib/api";
import { parseReturnCheck } from "@/lib/returnCheck";
import { returnReservations } from "@/lib/returnOps";

// POST /api/reservations/return-bulk — 여러 예약 한 번에 반납 처리. body: { ids: string[], check? }
// 건별 규칙·알림은 lib/returnOps (텔레그램 반납 체크리스트와 공용)
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === "string") : [];
  if (ids.length === 0 || ids.length > 30) return json({ error: "반납할 예약을 1~30건 지정해주세요." }, 400);
  const check = parseReturnCheck(body?.check);
  if (check && "error" in check) return json({ error: check.error }, 400);

  await connectDB();
  const r = await returnReservations(user, ids, check);
  return json({ returned: r.returnedNames.length, late: r.late, skipped: r.skipped });
}
