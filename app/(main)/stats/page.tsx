import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { BOARD_ROLES, type SessionUser } from "@/lib/permissions";
import { computeStats, RANGE_LABEL, type StatsRange } from "@/lib/stats";
import { MonthlyBars, HBars } from "@/components/stats/Charts";

export const dynamic = "force-dynamic";

// 통계 — 과장·부과장·부장단·관리자
export default async function StatsPage({ searchParams }: { searchParams: { range?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const user = session.user as SessionUser;
  const allowed = user.role === "admin" || user.role === "leader" || user.role === "vice_leader" || BOARD_ROLES.includes(user.role);
  if (!allowed) redirect("/home");

  const range: StatsRange = (["3m", "6m", "12m"] as const).includes(searchParams.range as any) ? (searchParams.range as StatsRange) : "6m";
  const s = await computeStats(range);
  const t = s.totals;

  const tile = (label: string, value: string, sub?: string, tone?: "warn") => (
    <div className={`st-tile${tone ? ` ${tone}` : ""}`}>
      <span className="st-tile-label">{label}</span>
      <b className="st-tile-val">{value}</b>
      {sub && <span className="st-tile-sub">{sub}</span>}
    </div>
  );

  return (
    <div className="st-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">통계</h1>
          <p className="page-sub">사진과의 촬영량·담당·장비 사용을 한눈에 봐요. 촬영 카테고리이거나 촬영 진행 관리가 켜진 일정이 기준이에요.</p>
        </div>
        <div className="seg" role="tablist" aria-label="기간">
          {(Object.keys(RANGE_LABEL) as StatsRange[]).map((r) => (
            <Link key={r} href={`/stats?range=${r}`} className={`seg-link${r === range ? " on" : ""}`}>{RANGE_LABEL[r]}</Link>
          ))}
        </div>
      </div>

      <div className="st-tiles">
        {tile("촬영", `${t.shoots}건`, s.rangeLabel)}
        {tile("평균 보고 소요", t.avgTurn === null ? "—" : `${t.avgTurn}일`, t.reportedCount ? `촬영 끝 → 보고, ${t.reportedCount}건 기준` : "보고 완료된 촬영 없음")}
        {tile("보고 지연", `${t.late}건`, t.late ? "마감이 지났는데 보고 전" : "지연 없음", t.late ? "warn" : undefined)}
        {tile("장비 대여", `${t.rentals}건`, `평균 가동률 ${t.avgUtil}%`)}
      </div>

      <div className="st-grid">
        <section className="card st-card st-wide">
          <h2 className="st-title">월별 촬영 건수 <span className="st-title-sub">{s.rangeLabel} · 촬영 시작일 기준</span></h2>
          <MonthlyBars data={s.monthly} unit="건" />
        </section>

        <section className="card st-card">
          <h2 className="st-title">사람별 촬영 횟수 <span className="st-title-sub">담당자 기준</span></h2>
          <HBars rows={s.byPerson} unit="회" empty="과원이 없어요." />
          {s.unassigned > 0 && <p className="st-foot">담당자 없이 등록된 촬영 {s.unassigned}건은 빠져 있어요.</p>}
        </section>

        <section className="card st-card">
          <h2 className="st-title">단계별 밀린 촬영 <span className="st-title-sub">지금 기준</span></h2>
          <HBars rows={s.stageWait} unit="건" empty="진행 중인 촬영이 없어요." />
          <p className="st-foot"><Link href="/pipeline">촬영 진행 보드에서 처리하기 →</Link></p>
        </section>

        <section className="card st-card st-wide">
          <h2 className="st-title">장비 가동률 <span className="st-title-sub">{s.rangeLabel} · 실제로 빌려간 시간 비율 (일찍 반납하면 반납 시각까지)</span></h2>
          <div className="st-util">
            <HBars
              rows={s.util.slice(0, Math.ceil(s.util.length / 2)).map((u) => ({ label: u.label, sub: u.sub, value: u.value, note: `${u.count}회 · ${u.days}일` }))}
              unit="%" max={100} empty="등록된 장비가 없어요."
            />
            <HBars
              rows={s.util.slice(Math.ceil(s.util.length / 2)).map((u) => ({ label: u.label, sub: u.sub, value: u.value, note: `${u.count}회 · ${u.days}일` }))}
              unit="%" max={100} empty=""
            />
          </div>
        </section>
      </div>
    </div>
  );
}
