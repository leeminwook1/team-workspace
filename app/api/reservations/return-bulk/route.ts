import { connectDB } from "@/lib/mongodb";
import { Reservation } from "@/models/Reservation";
import { Resource } from "@/models/Resource";
import { requireActiveUser, json } from "@/lib/api";
import { canMarkReturned } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";

// POST /api/reservations/return-bulk — 여러 예약 한 번에 반납 처리. body: { ids: string[] }
// 건별로 단건 반납과 동일한 규칙(booked만·예약자/관리담당자/과장단) 적용, 권한 없는 건은 건너뜀.
export async function POST(req: Request) {
  const { user, error } = await requireActiveUser();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === "string") : [];
  if (ids.length === 0 || ids.length > 30) return json({ error: "반납할 예약을 1~30건 지정해주세요." }, 400);

  await connectDB();
  const now = new Date();
  const list: any[] = await Reservation.find({ _id: { $in: ids } }).lean();
  const resources: any[] = await Resource.find({ _id: { $in: list.map((r) => r.resourceId) } })
    .select("name managerId").lean();
  const resById = new Map(resources.map((r) => [String(r._id), r]));

  const returnedNames: string[] = [];
  let lateCount = 0;
  const skipped: { name: string; reason: string }[] = [];
  // 알림 수신자(예약자·장비 관리 담당자)별로 장비 이름을 묶는다
  const notifyMap = new Map<string, string[]>();

  for (const r of list) {
    const res = resById.get(String(r.resourceId));
    const name = res?.name ?? "장비";
    if (r.status === "returned") { skipped.push({ name, reason: "이미 반납됨" }); continue; }
    if (r.status !== "booked") { skipped.push({ name, reason: "취소된 예약" }); continue; }
    if (!canMarkReturned(user, String(r.reservedBy), res?.managerId ? String(res.managerId) : null)) {
      skipped.push({ name, reason: "권한 없음" });
      continue;
    }
    const late = now.getTime() > new Date(r.endAt).getTime() + 10 * 60_000;
    if (late) lateCount += 1;
    await Reservation.updateOne(
      { _id: r._id, status: "booked" },
      { $set: { status: "returned", returnedAt: now, returnedBy: user.id } }
    );
    returnedNames.push(name);
    for (const uid of [String(r.reservedBy), res?.managerId ? String(res.managerId) : ""]) {
      if (!uid || uid === user.id) continue;
      if (!notifyMap.has(uid)) notifyMap.set(uid, []);
      notifyMap.get(uid)!.push(name);
    }
  }

  if (returnedNames.length > 0) {
    await logActivity({
      actorId: user.id, actorName: user.name, action: "status", targetType: "reservation",
      targetTitle: `일괄 반납 ${returnedNames.length}건 (${returnedNames.slice(0, 3).join(", ")}${returnedNames.length > 3 ? " 외" : ""})`,
      meta: { detail: lateCount > 0 ? `지연 ${lateCount}건 포함` : "일괄 반납" },
    });
    for (const [uid, names] of Array.from(notifyMap.entries())) {
      await notify([uid], {
        type: "reservation",
        title: `✅ 장비 ${names.length}건이 반납되었습니다`,
        body: `${names.slice(0, 4).join(", ")}${names.length > 4 ? ` 외 ${names.length - 4}건` : ""} — ${user.name} 님이 반납 처리`,
        link: "/resources",
      });
    }
  }

  return json({ returned: returnedNames.length, late: lateCount, skipped });
}
