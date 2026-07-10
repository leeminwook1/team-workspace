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
      {/* 인사 + 요약 숫자 */}
      <div className="dash-head">
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

      <div className="dash-stats">
        <Link href="/calendar" className="dash-stat"><b>{todayTasks.length}</b><span>오늘 일정</span></Link>
        <Link href="/events" className="dash-stat"><b className={dueSoon.some((d) => d.overdue) ? "danger" : ""}>{dueSoon.length}</b><span>마감 임박</span></Link>
        {canUseDirectives(user) && (
          <Link href="/directives" className="dash-stat"><b className={pendingDirs.length ? "warn" : ""}>{pendingDirs.length}</b><span>대기 TODO</span></Link>
        )}
        <Link href="/resources" className="dash-stat"><b>{todayResv.length}</b><span>오늘 예약</span></Link>
      </div>

      <div className="dash-grid">
        {/* 오늘 일정 */}
        <section className="card dash-card">
          <div className="dash-card-head"><h2>오늘 일정</h2><Link href="/calendar">달력 →</Link></div>
          {todayTasks.length === 0 ? (
            <p className="dash-empty">오늘은 등록된 일정이 없어요.</p>
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
          <div className="dash-card-head"><h2>마감 임박 할 일</h2><Link href="/events">행사 →</Link></div>
          {dueSoon.length === 0 ? (
            <p className="dash-empty">7일 내 마감인 할 일이 없어요. 👍</p>
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
          <div className="dash-card-head"><h2>진행 중 행사</h2><Link href="/events">전체 →</Link></div>
          {upcoming.length === 0 ? (
            <p className="dash-empty">진행 중인 행사가 없어요.</p>
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
            <div className="dash-card-head"><h2>대기 중 TODO</h2><Link href="/directives">전체 →</Link></div>
            {pendingDirs.length === 0 ? (
              <p className="dash-empty">대기 중인 TODO가 없어요.</p>
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
          <div className="dash-card-head"><h2>오늘 자원 예약</h2><Link href="/resources">예약 →</Link></div>
          {todayResv.length === 0 ? (
            <p className="dash-empty">오늘 예약된 장비·자원이 없어요.</p>
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
