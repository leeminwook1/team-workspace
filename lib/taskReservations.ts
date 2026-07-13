import { Reservation } from "@/models/Reservation";
import "@/models/Resource";

// 업무 ↔ 자원(장비) 예약 연동.
// 업무 기간을 예약 시간창으로 변환하고, 선택된 장비 목록과 기존 연동 예약을 동기화한다.

// 업무의 예약 시간창 — 시간 지정은 그대로, 하루 종일은 KST 날짜 범위 전체
// (allDay의 startDate/endDate는 해당 날짜의 UTC 자정으로 저장됨 → KST 자정은 -9h)
export function taskWindow(task: { startDate: Date; endDate: Date; allDay: boolean }) {
  if (!task.allDay) return { startAt: task.startDate, endAt: task.endDate };
  const KST = 9 * 3600_000;
  return {
    startAt: new Date(task.startDate.getTime() - KST),
    endAt: new Date(task.endDate.getTime() - KST + 24 * 3600_000), // 종료일 그날 자정까지
  };
}

/** 해당 시간창에서 장비 충돌 검사 — 이 업무에 연동된 예약은 제외. 충돌 목록 반환(비면 통과) */
export async function findConflicts(
  resourceIds: string[],
  window: { startAt: Date; endAt: Date },
  excludeTaskId?: string
) {
  if (resourceIds.length === 0) return [];
  const q: any = {
    resourceId: { $in: resourceIds },
    status: "booked",
    startAt: { $lt: window.endAt },
    endAt: { $gt: window.startAt },
  };
  if (excludeTaskId) q.relatedTaskId = { $ne: excludeTaskId };
  const conflicts = await Reservation.find(q)
    .populate("resourceId", "name")
    .populate("reservedBy", "name")
    .lean();
  return conflicts.map((c: any) => ({
    resource: c.resourceId?.name ?? "자원",
    by: c.reservedBy?.name ?? "?",
    startAt: c.startAt as Date,
    endAt: c.endAt as Date,
  }));
}

/**
 * 생성 직후 이중예약 방어 — 사전 충돌 검사와 create가 원자적이지 않아,
 * 동시 요청 두 개가 모두 검사를 통과할 수 있다. 생성 후 다른 겹침 예약이
 * 보이면 내 예약을 지우고 그 충돌을 반환한다(호출측은 409 처리).
 * 최악의 경우 둘 다 물러나 재시도하게 되지만, 이중예약은 발생하지 않는다.
 */
export async function postCreateGuard(resv: { _id: any; resourceId: any; startAt: Date; endAt: Date }) {
  const other: any = await Reservation.findOne({
    _id: { $ne: resv._id },
    resourceId: resv.resourceId,
    status: "booked",
    startAt: { $lt: resv.endAt },
    endAt: { $gt: resv.startAt },
  }).lean();
  if (!other) return null;
  await Reservation.deleteOne({ _id: resv._id });
  return other;
}

export function conflictMessage(conflicts: { resource: string; by: string; startAt: Date; endAt: Date }[]) {
  const fmt = (d: Date) => new Date(d).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const first = conflicts[0];
  const rest = conflicts.length > 1 ? ` 외 ${conflicts.length - 1}건` : "";
  return `장비가 이미 예약된 시간입니다: ${first.resource} (${first.by} — ${fmt(first.startAt)}~${fmt(first.endAt)})${rest}`;
}

/**
 * 업무의 연동 예약을 원하는 장비 목록·시간창에 맞춘다.
 * - 목록에서 빠진 장비 → 예약 취소
 * - 유지되는 장비 → 시간창 갱신
 * - 새 장비 → 예약 생성
 * 충돌 검사는 호출 측에서 findConflicts로 먼저 통과시킨 뒤 호출할 것.
 */
export async function syncTaskReservations(
  task: { _id: any; teamIds: any[] },
  resourceIds: string[],
  window: { startAt: Date; endAt: Date },
  actorId: string
) {
  const existing: any[] = await Reservation.find({ relatedTaskId: task._id, status: "booked" }).lean();
  const wanted = new Set(resourceIds);
  const have = new Map(existing.map((r) => [String(r.resourceId), r]));

  const toCancel = existing.filter((r) => !wanted.has(String(r.resourceId)));
  if (toCancel.length > 0) {
    await Reservation.updateMany({ _id: { $in: toCancel.map((r) => r._id) } }, { $set: { status: "cancelled" } });
  }

  for (const rid of resourceIds) {
    const cur = have.get(rid);
    if (cur) {
      // 시간창이 달라졌으면 이동
      if (new Date(cur.startAt).getTime() !== window.startAt.getTime() || new Date(cur.endAt).getTime() !== window.endAt.getTime()) {
        await Reservation.updateOne({ _id: cur._id }, { $set: { startAt: window.startAt, endAt: window.endAt } });
      }
    } else {
      await Reservation.create({
        resourceId: rid,
        teamId: task.teamIds[0],
        reservedBy: actorId,
        relatedTaskId: task._id,
        startAt: window.startAt,
        endAt: window.endAt,
        note: "일정 연동 예약",
      });
    }
  }
}

/** 업무(들) 삭제 시 연동 예약 일괄 취소 */
export async function cancelTaskReservations(taskIds: any[]) {
  if (taskIds.length === 0) return;
  await Reservation.updateMany(
    { relatedTaskId: { $in: taskIds }, status: "booked" },
    { $set: { status: "cancelled" } }
  );
}
