import { Reservation } from "@/models/Reservation";
import { Resource } from "@/models/Resource";
import { canMarkReturned, type SessionUser } from "./permissions";
import { logActivity, reservationLabel } from "./activity";
import { notify } from "./notify";
import { reportIssue, type ReturnCheck } from "./returnCheck";

// 여러 예약 한 번에 반납 — 웹 일괄 반납(/api/reservations/return-bulk)과 텔레그램 반납 체크리스트가 같이 쓴다.
// 건별로 booked만·예약자/관리 담당자/과장단 규칙, 권한 없는 건은 건너뜀. 체크리스트 이상 시 담당자·과장 알림.
export async function returnReservations(user: SessionUser, ids: string[], check: ReturnCheck | null, via?: string) {
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
    // 조건부 갱신 — 동시에 두 번 눌러도 한 번만 반납
    const u = await Reservation.updateOne(
      { _id: r._id, status: "booked" },
      { $set: { status: "returned", returnedAt: now, returnedBy: user.id, ...(check ? { returnCheck: check } : {}) } }
    );
    if (u.modifiedCount === 0) { skipped.push({ name, reason: "이미 반납됨" }); continue; }
    if (late) lateCount += 1;
    returnedNames.push(name);
    for (const uid of [String(r.reservedBy), res?.managerId ? String(res.managerId) : ""]) {
      if (!uid || uid === user.id) continue;
      if (!notifyMap.has(uid)) notifyMap.set(uid, []);
      notifyMap.get(uid)!.push(name);
    }
  }

  if (check && returnedNames.length > 0) {
    const managers = resources.map((r) => (r.managerId ? String(r.managerId) : "")).filter(Boolean);
    await reportIssue(returnedNames, check, user, managers);
  }
  if (returnedNames.length > 0) {
    const single = returnedNames.length === 1 && list.length === 1;
    await logActivity({
      actorId: user.id, actorName: user.name ?? "", action: "status", targetType: "reservation",
      targetTitle: single
        ? reservationLabel(returnedNames[0], list[0].startAt, list[0].endAt)
        : `일괄 반납 ${returnedNames.length}건 (${returnedNames.slice(0, 3).join(", ")}${returnedNames.length > 3 ? " 외" : ""})`,
      meta: { detail: `${lateCount > 0 ? `지연 ${lateCount}건 포함` : single ? "반납 완료" : "일괄 반납"}${via ? ` (${via})` : ""}` },
    });
    for (const [uid, names] of Array.from(notifyMap.entries())) {
      await notify([uid], {
        type: "reservation",
        title: lateCount > 0 ? `⏰ 장비 ${names.length}건이 반납되었습니다 (지연 포함)` : `✅ 장비 ${names.length}건이 반납되었습니다`,
        body: `${names.slice(0, 4).join(", ")}${names.length > 4 ? ` 외 ${names.length - 4}건` : ""} — ${user.name ?? ""} 님이 반납 처리`,
        link: "/resources",
      });
    }
  }
  return { returnedNames, late: lateCount, skipped };
}
