// 통계 차트 — 단일 색(--primary) 막대만 쓴다 (계열 1개라 범례 없음, 제목이 계열을 말해줌).
// 막대 끝 4px 라운드·기준선 고정, 값은 hover/포커스 툴팁 + 최댓값만 직접 표기.

export function MonthlyBars({ data, unit }: { data: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);
  return (
    <>
      <div className="vb" role="img" aria-label={data.map((d) => `${d.label} ${d.value}${unit}`).join(", ")}>
        {data.map((d) => (
          <div className="vb-col" key={d.label} tabIndex={0}>
            <div className="vb-plot">
              {d === peak && d.value > 0 && <span className="vb-peak">{d.value}</span>}
              <span className="vb-bar" style={{ height: `${(d.value / max) * 100}%` }} />
              <span className="vb-tip">{d.label} · <b>{d.value}{unit}</b></span>
            </div>
            <span className="vb-label">{d.label}</span>
          </div>
        ))}
      </div>
      <details className="st-table">
        <summary>표로 보기</summary>
        <table className="table">
          <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td style={{ textAlign: "right" }}>{d.value}{unit}</td></tr>)}</tbody>
        </table>
      </details>
    </>
  );
}

export function HBars({ rows, unit, empty, max: fixedMax }: {
  rows: { label: string; value: number; sub?: string; note?: string }[]; unit: string; empty: string; max?: number;
}) {
  if (rows.length === 0) return <p className="muted-note" style={{ padding: "8px 2px" }}>{empty}</p>;
  const max = fixedMax ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="st-bars">
      {rows.map((r, i) => (
        <div className="st-bar-row" key={i} title={`${r.label} — ${r.value}${unit}${r.note ? ` · ${r.note}` : ""}`}>
          <div className="st-bar-head">
            <span className="st-bar-label">
              {r.label}
              {r.sub && <span className="st-bar-sub">{r.sub}</span>}
            </span>
            <span className="st-bar-val">{r.value}<small>{unit}</small>{r.note && <em className="st-bar-note">{r.note}</em>}</span>
          </div>
          <div className="st-bar-track"><span style={{ width: `${Math.min(100, (r.value / max) * 100)}%`, background: "var(--primary)" }} /></div>
        </div>
      ))}
    </div>
  );
}
