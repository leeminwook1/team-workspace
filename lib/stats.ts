import { connectDB } from "./mongodb";
import { Task } from "@/models/Task";
import { Reservation } from "@/models/Reservation";
import { Resource } from "@/models/Resource";
import { Category } from "@/models/Category";
import { User } from "@/models/User";
import "@/models/ResourceCategory";
import { STEP_KEYS, STEP_LABEL } from "./pipeline";

// 사진과 통계 — 촬영 건수·사람별 촬영·장비 가동률·진행 단계.
// "촬영" = 촬영 카테고리 일정 또는 촬영 진행 관리가 켜진 일정.

const DAY = 86_400_000;
const KST = 9 * 3600_000;

export type StatsRange = "3m" | "6m" | "12m";
export const RANGE_LABEL: Record<StatsRange, string> = { "3m": "최근 3개월", "6m": "최근 6개월", "12m": "최근 12개월" };

function kstMonthStart(y: number, m: number) {
  return new Date(Date.UTC(y, m, 1) - KST);
}

export async function computeStats(range: StatsRange) {
  await connectDB();
  const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  const kst = new Date(Date.now() + KST);
  const y = kst.getUTCFullYear(), m = kst.getUTCMonth();
  const from = kstMonthStart(y, m - (months - 1));
  const to = kstMonthStart(y, m + 1);
  const now = new Date();

  const shootCats = (await Category.find({ name: /촬영/ }).select("_id").lean()).map((c: any) => c._id);
  const shoots: any[] = await Task.find({
    startDate: { $lt: to }, endDate: { $gte: from },
    $or: [{ categoryId: { $in: shootCats } }, { "pipeline.on": true }],
  }).select("title startDate endDate assignees pipeline status").populate("assignees", "name").lean();

  // 월별 촬영 건수 (시작일 기준, KST)
  const monthly = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(y, m - (months - 1) + i, 1));
    return { key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: `${d.getUTCMonth() + 1}월`, value: 0 };
  });
  for (const t of shoots) {
    const k = new Date(new Date(t.startDate).getTime() + KST);
    const slot = monthly.find((x) => x.key === `${k.getUTCFullYear()}-${k.getUTCMonth()}`);
    if (slot) slot.value += 1;
  }

  // 사람별 촬영 횟수 (담당자 기준) — 0회인 과원도 보이게 활성 과원 전원 포함
  const people = new Map<string, { label: string; value: number }>();
  const members: any[] = await User.find({ status: "active", role: { $in: ["leader", "vice_leader", "member"] } }).select("name").lean();
  for (const u of members) people.set(String(u._id), { label: u.name, value: 0 });
  for (const t of shoots) {
    for (const a of t.assignees ?? []) {
      if (!a?._id) continue;
      const p = people.get(String(a._id)) ?? { label: a.name, value: 0 };
      p.value += 1;
      people.set(String(a._id), p);
    }
  }
  const byPerson = Array.from(people.values()).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ko"));
  const unassigned = shoots.filter((t) => !(t.assignees ?? []).length).length;

  // 진행 단계 — 보고 소요일(촬영 종료 → 보고), 지연, 단계별 대기
  const reported = shoots.filter((t) => t.pipeline?.on && t.pipeline.steps?.report);
  const turnDays = reported.map((t) => Math.max(0, (new Date(t.pipeline.steps.report).getTime() - new Date(t.endDate).getTime()) / DAY));
  const avgTurn = turnDays.length ? turnDays.reduce((a, b) => a + b, 0) / turnDays.length : null;
  const openPipes: any[] = await Task.find({ "pipeline.on": true, "pipeline.steps.report": null }).select("pipeline").lean();
  const late = openPipes.filter((t) => t.pipeline.reportDue && new Date(t.pipeline.reportDue) < now).length;
  const stageWait = STEP_KEYS.map((k) => ({
    label: `${STEP_LABEL[k]} 대기`,
    value: openPipes.filter((t) => STEP_KEYS.find((s) => !t.pipeline.steps?.[s]) === k).length,
  }));

  // 장비 가동률 — 기간 안에서 예약(반납 포함)이 잡혀 있던 시간 비율. 겹치는 예약은 합쳐서 계산
  const span = Math.min(to.getTime(), now.getTime()) - from.getTime();
  const resv: any[] = await Reservation.find({ status: { $in: ["booked", "returned"] }, startAt: { $lt: to }, endAt: { $gt: from } })
    .select("resourceId startAt endAt returnedAt").lean();
  const intervals = new Map<string, [number, number][]>();
  for (const r of resv) {
    const s = Math.max(new Date(r.startAt).getTime(), from.getTime());
    // 일찍 반납했으면 반납 시각까지만 사용한 것으로 본다
    const endRaw = r.returnedAt ? Math.min(new Date(r.returnedAt).getTime(), new Date(r.endAt).getTime()) : new Date(r.endAt).getTime();
    const e = Math.min(endRaw, now.getTime(), to.getTime());
    if (e <= s) continue;
    const k = String(r.resourceId);
    if (!intervals.has(k)) intervals.set(k, []);
    intervals.get(k)!.push([s, e]);
  }
  const resources: any[] = await Resource.find({ isActive: true }).select("name categoryId").populate("categoryId", "name").lean();
  const util = resources.map((res) => {
    const list = (intervals.get(String(res._id)) ?? []).sort((a, b) => a[0] - b[0]);
    let used = 0, cs = -1, ce = -1;
    for (const [s, e] of list) {
      if (s > ce) { if (ce > cs) used += ce - cs; cs = s; ce = e; } else ce = Math.max(ce, e);
    }
    if (ce > cs) used += ce - cs;
    const count = list.length;
    return {
      label: res.name,
      sub: res.categoryId?.name ?? "",
      value: span > 0 ? Math.round((used / span) * 1000) / 10 : 0, // %
      days: Math.round((used / DAY) * 10) / 10,
      count,
    };
  }).sort((a, b) => b.value - a.value || b.count - a.count);
  const avgUtil = util.length ? Math.round((util.reduce((a, b) => a + b.value, 0) / util.length) * 10) / 10 : 0;

  return {
    range, rangeLabel: RANGE_LABEL[range], from, to,
    totals: {
      shoots: shoots.length,
      avgTurn: avgTurn === null ? null : Math.round(avgTurn * 10) / 10,
      reportedCount: reported.length,
      late,
      rentals: resv.length,
      avgUtil,
    },
    monthly, byPerson, unassigned, stageWait, util,
  };
}
