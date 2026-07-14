import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";
import { Team } from "@/models/Team";
import { Task } from "@/models/Task";
import { Event } from "@/models/Event";
import { Reservation } from "@/models/Reservation";
import { Resource } from "@/models/Resource";
import { ResourceCategory } from "@/models/ResourceCategory";
import { canApproveUsers, type SessionUser } from "@/lib/permissions";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

// KST 이번 달 경계
function kstMonth() {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const y = kst.getUTCFullYear(), m = kst.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - 9 * 3600_000);
  const end = new Date(Date.UTC(y, m + 1, 1) - 9 * 3600_000);
  return { y, m, start, end, kst };
}

// 가로 막대 목록 (값이 큰 순서, 최대값 기준 비율)
function BarList({ rows, empty }: { rows: { label: string; value: number; color?: string; sub?: string }[]; empty: string }) {
  if (rows.length === 0) return <p className="muted-note" style={{ padding: "8px 2px" }}>{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="st-bars">
      {rows.map((r, i) => (
        <div className="st-bar-row" key={i}>
          <div className="st-bar-head">
            <span className="st-bar-label">
              {r.color && <span className="dot" style={{ background: r.color }} />}{r.label}
              {r.sub && <span className="st-bar-sub">{r.sub}</span>}
            </span>
            <b className="st-bar-val">{r.value}</b>
          </div>
          <div className="st-bar-track"><span style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? "var(--primary)" }} /></div>
        </div>
      ))}
    </div>
  );
}

export default async function AdminStatsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!canApproveUsers(session.user as SessionUser)) redirect("/admin");

  await connectDB();
  const { y, m, start, end } = kstMonth();

  const [
    activeUsers, teamsCount, monthTasks, monthResv, ongoingEvents,
    teams, cats,
    tasksByTeamAgg, resvByResAgg, resvByCatAgg, eventsRaw,
  ] = await Promise.all([
    User.countDocuments({ status: "active" }),
    Team.countDocuments({ isActive: true }),
    Task.countDocuments({ startDate: { $lt: end }, endDate: { $gt: start } }),
    Reservation.countDocuments({ status: { $in: ["booked", "returned"] }, startAt: { $lt: end }, endAt: { $gt: start } }),
    Event.countDocuments({ deletedAt: null, closedAt: null }),
    Team.find({ isActive: true }).select("name color").lean(),
    ResourceCategory.find({ isActive: true }).select("name color order").lean(),
    // 팀별 이번 달 업무 수 (다중 팀 협업은 각 팀에 카운트)
    Task.aggregate([
      { $match: { startDate: { $lt: end }, endDate: { $gt: start } } },
      { $unwind: "$teamIds" },
      { $group: { _id: "$teamIds", count: { $sum: 1 } } },
    ]),
    // 장비 예약 순위 (취소 제외, 전체 기간) Top 10
    Reservation.aggregate([
      { $match: { status: { $in: ["booked", "returned"] } } },
      { $group: { _id: "$resourceId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    // 분류별 예약 (자원 → 분류 조인)
    Reservation.aggregate([
      { $match: { status: { $in: ["booked", "returned"] } } },
      { $lookup: { from: "resources", localField: "resourceId", foreignField: "_id", as: "res" } },
      { $unwind: "$res" },
      { $group: { _id: "$res.categoryId", count: { $sum: 1 } } },
    ]),
    // 월별 행사 — 최근 6개월 버킷 (JS 집계)
    Event.find({ deletedAt: null, eventDate: { $ne: null } }).select("eventDate").lean(),
  ]);

  // 팀별 업무 (팀 이름·색 매핑, 값 큰 순)
  const teamById = new Map(teams.map((t: any) => [String(t._id), t]));
  const teamRows = (tasksByTeamAgg as any[])
    .map((a) => ({ team: teamById.get(String(a._id)), count: a.count }))
    .filter((r) => r.team)
    .sort((a, b) => b.count - a.count)
    .map((r) => ({ label: r.team.name, value: r.count, color: r.team.color }));

  // 장비 예약 순위 (이름 매핑)
  const resIds = (resvByResAgg as any[]).map((a) => a._id);
  const resDocs = await Resource.find({ _id: { $in: resIds } }).select("name").lean();
  const resName = new Map(resDocs.map((r: any) => [String(r._id), r.name]));
  const resourceRows = (resvByResAgg as any[])
    .map((a) => ({ label: resName.get(String(a._id)) ?? "(삭제된 장비)", value: a.count }));

  // 분류별 예약
  const catById = new Map(cats.map((c: any) => [String(c._id), c]));
  const catRows = (resvByCatAgg as any[])
    .map((a) => ({ cat: catById.get(String(a._id)), count: a.count }))
    .filter((r) => r.cat)
    .sort((a, b) => b.count - a.count)
    .map((r) => ({ label: r.cat.name, value: r.count, color: r.cat.color }));

  // 월별 행사 — 최근 6개월 (이번 달 포함)
  const monthKeys: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    monthKeys.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: `${d.getUTCMonth() + 1}월` });
  }
  const eventCount = new Map(monthKeys.map((k) => [k.key, 0]));
  for (const e of eventsRaw as any[]) {
    const d = new Date(e.eventDate);
    const kst = new Date(d.getTime() + 9 * 3600_000);
    const key = `${kst.getUTCFullYear()}-${kst.getUTCMonth()}`;
    if (eventCount.has(key)) eventCount.set(key, (eventCount.get(key) ?? 0) + 1);
  }
  const eventRows = monthKeys.map((k) => ({ label: k.label, value: eventCount.get(k.key) ?? 0 }));

  const stat = (icon: any, tint: string, value: number, label: string) => (
    <div className="dash-stat" style={{ cursor: "default" }}>
      <span className="dash-stat-ico" style={{ background: `color-mix(in srgb, ${tint} 12%, transparent)`, color: tint }}><Icon name={icon} size={19} /></span>
      <span className="dash-stat-body"><b>{value}</b><span>{label}</span></span>
    </div>
  );

  return (
    <div style={{ maxWidth: 900 }}>
      {/* 요약 숫자 */}
      <div className="dash-stats" style={{ marginBottom: 22 }}>
        {stat("userLine", "var(--primary)", activeUsers, "활성 사용자")}
        {stat("users", "var(--st-prog)", teamsCount, "팀")}
        {stat("calendar", "var(--st-done)", monthTasks, "이번 달 업무")}
        {stat("resources", "var(--danger)", monthResv, "이번 달 예약")}
        {stat("board", "#8b5cf6", ongoingEvents, "진행 중 행사")}
      </div>

      <div className="st-grid">
        <section className="card st-card">
          <h2 className="st-title">팀별 업무량 <span className="st-title-sub">이번 달</span></h2>
          <BarList rows={teamRows} empty="이번 달 등록된 업무가 없습니다." />
        </section>

        <section className="card st-card">
          <h2 className="st-title">장비 예약 순위 <span className="st-title-sub">전체 · Top 10</span></h2>
          <BarList rows={resourceRows} empty="예약 기록이 없습니다." />
        </section>

        <section className="card st-card">
          <h2 className="st-title">분류별 예약 <span className="st-title-sub">전체</span></h2>
          <BarList rows={catRows} empty="예약 기록이 없습니다." />
        </section>

        <section className="card st-card">
          <h2 className="st-title">월별 행사 수 <span className="st-title-sub">최근 6개월</span></h2>
          <BarList rows={eventRows} empty="행사가 없습니다." />
        </section>
      </div>
    </div>
  );
}
