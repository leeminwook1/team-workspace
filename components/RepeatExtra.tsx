"use client";

// 반복 추가 입력 — 업무·개인 일정 등록 창 공용 (규칙은 lib/repeatRule)
//  every : [3] [일/주]마다
//  dates : 고른 날짜 칩(✕로 빼기) + [＋ 날짜 추가] — 시작일은 항상 포함

import { DateField, fmtDateLabel } from "@/components/DateTimePicker";
import { MAX_REPEAT_DATES } from "@/lib/repeatRule";

export type RepeatMode = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "every" | "dates";

/** 화면 상태 → API 값 (every는 d3·w2 형식) */
export function encodeRepeat(mode: RepeatMode, n: number, unit: "d" | "w") {
  if (mode !== "every") return mode;
  const max = unit === "w" ? 12 : 60;
  const v = Math.min(Math.max(Math.round(n) || 2, 2), max);
  return `${unit}${v}`;
}

export function RepeatEvery({ n, unit, onN, onUnit }: {
  n: number; unit: "d" | "w"; onN: (v: number) => void; onUnit: (u: "d" | "w") => void;
}) {
  return (
    <div className="rp-every">
      <input
        type="number" inputMode="numeric" min={2} max={unit === "w" ? 12 : 60} value={n || ""}
        onChange={(e) => onN(Number(e.target.value))} aria-label="반복 간격"
      />
      <div className="seg rp-unit" role="radiogroup" aria-label="단위">
        <button type="button" role="radio" aria-checked={unit === "d"} className={unit === "d" ? "on" : ""} onClick={() => onUnit("d")}>일</button>
        <button type="button" role="radio" aria-checked={unit === "w"} className={unit === "w" ? "on" : ""} onClick={() => onUnit("w")}>주</button>
      </div>
      <span className="rp-every-tail">마다</span>
    </div>
  );
}

export function RepeatDates({ base, dates, onChange }: { base: string; dates: string[]; onChange: (d: string[]) => void }) {
  // 시작일보다 앞선 날짜는 빼고, 중복 없이 날짜순
  const list = Array.from(new Set(dates.filter((d) => d && d > base))).sort();
  const full = list.length + 1 >= MAX_REPEAT_DATES;
  return (
    <div className="rp-dates">
      <div className="rp-chips">
        <span className="chip rp-chip base" title="시작일 (항상 포함)">{fmtDateLabel(base, { short: true }) || "시작일"}</span>
        {list.map((d) => (
          <button key={d} type="button" className="chip chip-btn rp-chip" onClick={() => onChange(list.filter((x) => x !== d))} aria-label={`${d} 빼기`}>
            {fmtDateLabel(d, { short: true })} <span aria-hidden>✕</span>
          </button>
        ))}
        {!full && (
          <DateField
            value="" min={base} variant="inline" aria-label="반복 날짜 추가" className="rp-add"
            onChange={(v) => { if (v && v > base) onChange([...list, v]); }}
          >
            ＋ 날짜 추가
          </DateField>
        )}
      </div>
      <p className="rp-hint">시작일 포함 {list.length + 1}회 · 같은 시간으로 등록돼요{list.length === 0 ? " — 날짜를 하나 이상 더 골라주세요" : ""}</p>
    </div>
  );
}
