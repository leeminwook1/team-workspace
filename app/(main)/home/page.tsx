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
import {
  visibleTeamIds, canUseDirectives, canCreateDirective, canApproveUsers, type SessionUser,
} from "@/lib/permissions";
import { Icon, type IconName } from "@/components/icons";

// 카드 빈 상태 — 아이콘 원 + 안내문
function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="dash-empty">
      <span className="dash-empty-ico"><Icon name={icon} size={18} /></span>
      <span>{text}</span>
    </div>
  );
}

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
const fmtTime = (d: Date) => new Date(d).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtMD = (d: Date | string) => new Date(d).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = session.user as SessionUser & { name: string };

  await connectDB();
  const { start, end, kst } = kstToday();

  // 1) 오늘 일정 (조회 범위 내)
  const scope = visibleTeamIds(user);
  const taskQ: any = { startDate: { $lt: end }, endDate: { $gt: start } };
  if (scope !== "all") taskQ.teamIds = { $in: scope.length ? scope : [] };
  const todayTasks: any[] = scope !== "all" && scope.length === 0 ? [] : await Task.find(taskQ)
    .populate("teamIds", "name color")
    .sort({ allDay: -1, startDate: 1 })
    .limit(6)
    .lean();

  // 2) 행사 — 진행 중(행사일 미도래 또는 미지정) + 마감 임박 할 일
  const eventsRaw: any[] = await Event.find().sort({ eventDate: 1 }).limit(100).lean();
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

  // 3) 대기 중 TODO (지시함 조회 규칙)
  let pendingDirs: any[] = [];
  if (canUseDirectives(user)) {
    const dq: any = { status: "todo" };
    if (!canCreateDirective(user)) {
      if (user.teamId) dq.teamId = user.teamId;
      else dq.teamId = null;
    }
    pendingDirs = await Directive.find(dq).populate("teamId", "name color").sort({ dueDate: 1, createdAt: -1 }).limit(4).lean();
  }

  // 4) 오늘 자원 예약
  const todayResv: any[] = await Reservation.find({ status: "booked", startAt: { $lt: end }, endAt: { $gt: start } })
    .populate("resourceId", "name")
    .populate("teamId", "name color")
    .sort({ startAt: 1 })
    .limit(6)
    .lean();

  // 5) 승인 대기 (승인권자만)
  const pendingUsers = canApproveUsers(user) ? await User.countDocuments({ status: "pending" }) : 0;

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

      <div className="dash-grid">
        {/* 오늘 일정 */}
        <section className="card dash-card">
          <div className="dash-card-head"><h2><span className="dash-h-ico" style={{ background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}><Icon name="calendar" size={14} /></span>오늘 일정</h2><Link href="/calendar">달력 →</Link></div>
          {todayTasks.length === 0 ? (
            <Empty icon="calendar" text="오늘은 등록된 일정이 없어요." />
          ) : (
            <ul className="dash-list">
              {todayTasks.map((t: any) => (
                <li key={String(t._id)}>
                  <Link href={`/calendar?task=${String(t._id)}`} className="dash-row">
                    <span className="dash-time">{t.allDay ? "종일" : fmtTime(t.startDate)}</span>
                    <span className="dash-row-title">{t.title}</span>
                    <span className="dash-row-dots">
                      {(t.teamIds ?? []).filter(Boolean).slice(0, 3).map((tm: any) => (
                        <span className="dot" key={String(tm._id)} style={{ background: tm.color }} />
                      ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 마감 임박 */}
        <section className="card dash-card">
          <div className="dash-card-head"><h2><span className="dash-h-ico" style={{ background: "color-mix(in srgb, var(--danger) 11%, transparent)", color: "var(--danger)" }}><Icon name="clock" size={14} /></span>마감 임박 할 일</h2><Link href="/events">행사 →</Link></div>
          {dueSoon.length === 0 ? (
            <Empty icon="check" text="7일 내 마감인 할 일이 없어요." />
          ) : (
            <ul className="dash-list">
              {dueSoon.map((d, i) => (
                <li key={i}>
                  <Link href={`/events/${d.eventId}`} className="dash-row">
                    <span className={`dash-due${d.overdue ? " overdue" : ""}`}>{d.overdue ? "지연" : fmtMD(d.dueDate)}</span>
                    <span className="dash-row-title">{d.title}</span>
                    <span className="dash-row-sub">{d.eventTitle}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 진행 중 행사 */}
        <section className="card dash-card">
          <div className="dash-card-head"><h2><span className="dash-h-ico" style={{ background: "color-mix(in srgb, #8b5cf6 13%, transparent)", color: "#8b5cf6" }}><Icon name="board" size={14} /></span>진행 중 행사</h2><Link href="/events">전체 →</Link></div>
          {upcoming.length === 0 ? (
            <Empty icon="board" text="진행 중인 행사가 없어요." />
          ) : (
            <ul className="dash-list">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="dash-row dash-row-col">
                    <span className="dash-row-between">
                      <span className="dash-row-title">{e.title}</span>
                      <span className="dash-pct">{e.total ? `${e.pct}%` : "—"}</span>
                    </span>
                    <span className="kb-check-bar"><span style={{ width: `${e.pct}%` }} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 대기 TODO / 오늘 예약 */}
        {canUseDirectives(user) && (
          <section className="card dash-card">
            <div className="dash-card-head"><h2><span className="dash-h-ico" style={{ background: "color-mix(in srgb, var(--st-prog) 13%, transparent)", color: "var(--st-prog)" }}><Icon name="inbox" size={14} /></span>대기 중 TODO</h2><Link href="/directives">전체 →</Link></div>
            {pendingDirs.length === 0 ? (
              <Empty icon="check" text="대기 중인 TODO가 없어요." />
            ) : (
              <ul className="dash-list">
                {pendingDirs.map((d: any) => (
                  <li key={String(d._id)}>
                    <Link href="/directives" className="dash-row">
                      <span className="dash-row-dots">
                        {d.teamId?.color && <span className="dot" style={{ background: d.teamId.color }} />}
                      </span>
                      <span className="dash-row-title">{d.title}</span>
                      {d.dueDate && <span className="dash-row-sub">마감 {fmtMD(d.dueDate)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="card dash-card">
          <div className="dash-card-head"><h2><span className="dash-h-ico" style={{ background: "color-mix(in srgb, var(--st-done) 12%, transparent)", color: "var(--st-done)" }}><Icon name="resources" size={14} /></span>오늘 자원 예약</h2><Link href="/resources">예약 →</Link></div>
          {todayResv.length === 0 ? (
            <Empty icon="resources" text="오늘 예약된 장비·자원이 없어요." />
          ) : (
            <ul className="dash-list">
              {todayResv.map((r: any) => (
                <li key={String(r._id)}>
                  <Link href="/resources" className="dash-row">
                    <span className="dash-time">{fmtTime(r.startAt)}~{fmtTime(r.endAt)}</span>
                    <span className="dash-row-title">{r.resourceId?.name ?? "자원"}</span>
                    <span className="dash-row-dots">
                      {r.teamId?.color && <span className="dot" style={{ background: r.teamId.color }} />}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
