import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import { Task } from "@/models/Task";
import { Event } from "@/models/Event";
import { Directive } from "@/models/Directive";
import { Reservation } from "@/models/Reservation";
import { User } from "@/models/User";
import "@/models/Team";
import "@/models/Resource";
import "@/models/Category";
import {
  visibleTeamIds, canUseDirectives, canCreateDirective, canApproveUsers, type SessionUser,
} from "@/lib/permissions";
import { Icon } from "@/components/icons";
import HomeWidgets, { type WTask } from "@/components/home/HomeWidgets";
import { DEFAULT_LAYOUT, type WidgetSlot } from "@/lib/widgets";

export const dynamic = "force-dynamic";

// ── KST(한국시간) 기준 오늘 경계 (서버는 UTC로 돌기 때문에 명시 변환) ──
function kstToday() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const y = kst.getUTCFullYear(), m = kst.getUTCMonth(), d = kst.getUTCDate();
  const start = new Date(Date.UTC(y, m, d) - 9 * 3600_000); // KST 자정 = UTC-9h
  const end = new Date(start.getTime() + 24 * 3600_000);
  return { start, end, kst };
}

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = session.user as SessionUser & { name: string };

  await connectDB();
  const { start, end, kst } = kstToday();

  const scope = visibleTeamIds(user);
  const noScope = scope !== "all" && scope.length === 0;
  const scoped = (q: any) => {
    if (scope !== "all") q.teamIds = { $in: scope.length ? scope : [] };
    return q;
  };

  // 이번 달(KST) 경계 — 미니 달력 + 진행 현황용
  const kY = kst.getUTCFullYear(), kM = kst.getUTCMonth();
  const monthStart = new Date(Date.UTC(kY, kM, 1) - 9 * 3600_000);
  const monthEnd = new Date(Date.UTC(kY, kM + 1, 1) - 9 * 3600_000);

  // 대시보드 쿼리는 상호 독립 — 병렬 실행으로 첫 로딩 단축
  const dirQ: any = { status: "todo" };
  if (!canCreateDirective(user)) dirQ.teamId = user.teamId ?? null;
  const [todayTasks, eventsRaw, pendingDirs, todayResv, pendingUsers, monthTasks, upcomingTasks, meDoc] = (await Promise.all([
    // 1) 오늘 일정 (조회 범위 내)
    noScope ? [] : Task.find(scoped({ startDate: { $lt: end }, endDate: { $gt: start } }))
      .populate("teamIds", "name color").sort({ allDay: -1, startDate: 1 }).limit(6).lean(),
    // 2) 행사 — 진행 중 + 마감 임박 집계용 (삭제·종료된 행사 제외)
    Event.find({ deletedAt: null, closedAt: null }).sort({ eventDate: 1 }).limit(100).lean(),
    // 3) 대기 중 TODO (지시함 조회 규칙)
    canUseDirectives(user)
      ? Directive.find(dirQ).populate("teamId", "name color").sort({ dueDate: 1, createdAt: -1 }).limit(4).lean()
      : [],
    // 4) 오늘 자원 예약
    Reservation.find({ status: "booked", startAt: { $lt: end }, endAt: { $gt: start } })
      .populate("resourceId", "name").populate("teamId", "name color").sort({ startAt: 1 }).limit(6).lean(),
    // 5) 승인 대기 (승인권자만)
    canApproveUsers(user) ? User.countDocuments({ status: "pending" }) : 0,
    // 6) 이번 달 업무 — 미니 달력 + 진행 현황
    noScope ? [] : Task.find(scoped({ startDate: { $lt: monthEnd }, endDate: { $gt: monthStart } }))
      .populate("teamIds", "name color").populate("categoryId", "name color").sort({ startDate: 1 }).limit(300).lean(),
    // 7) 다가오는 일정 — 지금 이후 시작, 완료 제외
    noScope ? [] : Task.find(scoped({ startDate: { $gt: new Date() }, status: { $ne: "done" } }))
      .populate("teamIds", "name color").populate("categoryId", "name color").sort({ startDate: 1 }).limit(5).lean(),
    // 8) 내 위젯 배치
    User.findById(user.id).select("homeLayout").lean(),
  ])) as [any[], any[], any[], any[], number, any[], any[], any];

  const upcoming = eventsRaw
    .filter((e) => !e.eventDate || new Date(e.eventDate) >= start)
    .slice(0, 3)
    .map((e) => {
      const total = (e.items ?? []).length;
      const done = (e.items ?? []).filter((i: any) => i.status === "done").length;
      return {
        id: String(e._id), title: e.title, eventDate: e.eventDate,
        total, done, pct: total ? Math.round((done / total) * 100) : 0,
      };
    });
  const soonLimit = new Date(start.getTime() + 7 * 24 * 3600_000);
  const dueSoon = eventsRaw
    .flatMap((e) => (e.items ?? [])
      .filter((i: any) => i.dueDate && i.status !== "done" && new Date(i.dueDate) < soonLimit)
      .map((i: any) => ({
        eventId: String(e._id), eventTitle: e.title, title: i.title,
        dueDate: i.dueDate, overdue: new Date(i.dueDate) < start,
      })))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5);

  // ── 위젯 데이터 ──
  const mapTask = (t: any): WTask => ({
    id: String(t._id),
    title: t.title,
    startDate: new Date(t.startDate).toISOString(),
    endDate: new Date(t.endDate).toISOString(),
    allDay: !!t.allDay,
    status: t.status,
    priority: t.priority,
    location: t.location ?? "",
    teams: (t.teamIds ?? []).filter(Boolean).map((tm: any) => ({ id: String(tm._id), name: tm.name, color: tm.color })),
    category: t.categoryId ? { name: t.categoryId.name ?? "", color: t.categoryId.color ?? "#8b95a1" } : null,
  });

  // 내 위젯 배치 (없으면 기본 배치, 지시 권한 없으면 TODO 위젯 제외)
  const savedLayout: WidgetSlot[] | null = meDoc?.homeLayout?.length ? meDoc.homeLayout.map((w: any) => ({ id: w.id, size: w.size === 2 ? 2 : 1 })) : null;
  const layout = (savedLayout ?? DEFAULT_LAYOUT).filter((w) => (w.id === "todo" ? canUseDirectives(user) : true));

  const widgetData = {
    monthTasks: monthTasks.map(mapTask),
    upcoming: upcomingTasks.map(mapTask),
    todo: pendingDirs.map((d: any) => ({
      id: String(d._id), title: d.title,
      dueDate: d.dueDate ? new Date(d.dueDate).toISOString() : null,
      teamColor: d.teamId?.color ?? null,
    })),
    reservations: todayResv.map((r: any) => ({
      id: String(r._id),
      start: new Date(r.startAt).toISOString(), end: new Date(r.endAt).toISOString(),
      resource: r.resourceId?.name ?? "자원", teamColor: r.teamId?.color ?? null,
    })),
    duesoon: dueSoon.map((d) => ({ ...d, dueDate: new Date(d.dueDate).toISOString() })),
    events: upcoming.map((e) => ({ id: e.id, title: e.title, total: e.total, pct: e.pct })),
  };

  const dateLabel = kst.toLocaleDateString("ko-KR", { timeZone: "UTC", month: "long", day: "numeric", weekday: "long" });
  const hour = kst.getUTCHours();
  const greet = hour < 6 ? "늦은 밤이에요" : hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후예요" : "좋은 저녁이에요";

  return (
    <div className="dash">
      {/* 히어로 — 인사 (Toss 블루 그라디언트) */}
      <div className="dash-hero">
        <div>
          <p className="dash-date">{dateLabel}</p>
          <h1 className="dash-greet">{greet}, <b>{user.name}</b> 님</h1>
        </div>
        {pendingUsers > 0 && (
          <Link href="/admin/pending" className="dash-alert">
            가입 승인 대기 <b>{pendingUsers}명</b> →
          </Link>
        )}
      </div>

      {/* 요약 숫자 */}
      <div className="dash-stats">
        <Link href="/calendar" className="dash-stat">
          <span className="dash-stat-ico" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}><Icon name="calendar" size={19} /></span>
          <span className="dash-stat-body"><b>{todayTasks.length}</b><span>오늘 일정</span></span>
        </Link>
        <Link href="/events" className="dash-stat">
          <span className="dash-stat-ico" style={{ background: "color-mix(in srgb, var(--danger) 11%, transparent)", color: "var(--danger)" }}><Icon name="clock" size={19} /></span>
          <span className="dash-stat-body"><b className={dueSoon.some((d) => d.overdue) ? "danger" : ""}>{dueSoon.length}</b><span>마감 임박</span></span>
        </Link>
        {canUseDirectives(user) && (
          <Link href="/directives" className="dash-stat">
            <span className="dash-stat-ico" style={{ background: "color-mix(in srgb, var(--st-prog) 13%, transparent)", color: "var(--st-prog)" }}><Icon name="inbox" size={19} /></span>
            <span className="dash-stat-body"><b className={pendingDirs.length ? "warn" : ""}>{pendingDirs.length}</b><span>대기 TODO</span></span>
          </Link>
        )}
        <Link href="/resources" className="dash-stat">
          <span className="dash-stat-ico" style={{ background: "color-mix(in srgb, var(--st-done) 12%, transparent)", color: "var(--st-done)" }}><Icon name="resources" size={19} /></span>
          <span className="dash-stat-body"><b>{todayResv.length}</b><span>오늘 예약</span></span>
        </Link>
      </div>

      {/* 위젯 대시보드 — 추가·제거·순서·크기 커스터마이즈 (계정에 저장) */}
      <HomeWidgets initialLayout={layout} canDirectives={canUseDirectives(user)} data={widgetData} />
    </div>
  );
}
