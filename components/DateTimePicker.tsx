"use client";

// 날짜·시간 선택 — 브라우저 기본 입력(type=date/time) 대신 앱 디자인에 맞춘 픽커.
// 값 형식은 기본 입력과 같다: 날짜 "YYYY-MM-DD", 시간 "HH:MM" (빈 값 = "").
// 팝오버는 body로 포털해 fixed로 띄운다 — 모달 안(overflow)에서도 잘리지 않게.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => (s ? new Date(`${s}T00:00`) : null);

/** "2026년 11월 17일 (화)" — 올해면 연도 생략 */
export function fmtDateLabel(v: string, opts?: { short?: boolean }) {
  const d = parse(v);
  if (!d || isNaN(d.getTime())) return "";
  const thisYear = new Date().getFullYear() === d.getFullYear();
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  if (opts?.short) return `${thisYear ? "" : `${d.getFullYear() % 100}. `}${md} (${WD[d.getDay()]})`;
  return `${thisYear ? "" : `${d.getFullYear()}년 `}${md} (${WD[d.getDay()]})`;
}
/** "오전 10:00" */
export function fmtTimeLabel(v: string) {
  if (!/^\d{2}:\d{2}$/.test(v)) return "";
  const h = Number(v.slice(0, 2)), m = v.slice(3);
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${m}`;
}

/* ── 공용 팝오버 (트리거 아래, 공간 없으면 위로) ── */
function usePopover() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const t = triggerRef.current, p = popRef.current;
    if (!t || !p) return;
    const r = t.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let top = r.bottom + 6;
    if (top + ph > vh - 8 && r.top - ph - 6 > 8) top = r.top - ph - 6; // 아래 공간이 없으면 위로
    top = Math.max(8, Math.min(top, vh - ph - 8));
    const left = Math.max(8, Math.min(r.left, vw - pw - 8));
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (popRef.current?.contains(n) || triggerRef.current?.contains(n)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true); // 모달 ESC보다 먼저 — 픽커만 닫기
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  return { open, setOpen, triggerRef, popRef, pos };
}

type Variant = "field" | "inline" | "bare";
type BaseProps = {
  id?: string;
  disabled?: boolean;
  className?: string;
  variant?: Variant; // field = 폼 입력칸 모양, inline = 작은 칩, bare = className만 (children으로 내용 지정)
  placeholder?: string;
  "aria-label"?: string;
  children?: ReactNode; // 트리거 내용 직접 지정 (bare)
};

/* ── 날짜 ── */
export function DateField({
  value, onChange, min, max, clearable, short, ...rest
}: BaseProps & {
  value: string; onChange: (v: string) => void; min?: string; max?: string;
  clearable?: boolean; // "지우기" 버튼 (선택 항목)
  short?: boolean; // 트리거 라벨 짧게 (좁은 칸)
}) {
  const { open, setOpen, triggerRef, popRef, pos } = usePopover();
  const label = fmtDateLabel(value, { short });
  const variant = rest.variant ?? "field";
  return (
    <>
      <button
        type="button" id={rest.id} ref={triggerRef} disabled={rest.disabled}
        className={`dtp dtp-${variant}${open ? " open" : ""}${!value ? " empty" : ""} ${rest.className ?? ""}`}
        aria-haspopup="dialog" aria-expanded={open} aria-label={rest["aria-label"] ? `${rest["aria-label"]}: ${label || "선택 안 함"}` : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {rest.children ?? (
          <>
            {variant !== "bare" && <CalIcon />}
            <span className="dtp-text">{label || rest.placeholder || "날짜 선택"}</span>
          </>
        )}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={popRef} className="dtp-pop" role="dialog" aria-label="날짜 선택"
          style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}>
          <Calendar
            value={value} min={min} max={max}
            onPick={(v) => { onChange(v); setOpen(false); triggerRef.current?.focus(); }}
          />
          {(clearable || !value) && (
            <div className="dtp-foot">
              {clearable && value ? (
                <button type="button" className="dtp-link" onClick={() => { onChange(""); setOpen(false); }}>지우기</button>
              ) : <span />}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

function Calendar({ value, min, max, onPick }: { value: string; min?: string; max?: string; onPick: (v: string) => void }) {
  const today = ymd(new Date());
  const base = parse(value) ?? parse(min && min > today ? min : today)!;
  const [month, setMonth] = useState(() => new Date(base.getFullYear(), base.getMonth(), 1));
  const [focus, setFocus] = useState(value || (min && min > today ? min : today));
  const gridRef = useRef<HTMLDivElement>(null);

  const y = month.getFullYear(), m = month.getMonth();
  const offset = new Date(y, m, 1).getDay();
  const cells = Array.from({ length: 42 }, (_, i) => new Date(y, m, i - offset + 1));
  const disabled = (d: string) => (!!min && d < min) || (!!max && d > max);

  // 키보드 이동 — 화살표(하루·한 주), PageUp/Down(한 달), Enter/Space 선택
  function onKey(e: React.KeyboardEvent) {
    const f = parse(focus)!;
    const step: Record<string, () => Date> = {
      ArrowLeft: () => new Date(f.getFullYear(), f.getMonth(), f.getDate() - 1),
      ArrowRight: () => new Date(f.getFullYear(), f.getMonth(), f.getDate() + 1),
      ArrowUp: () => new Date(f.getFullYear(), f.getMonth(), f.getDate() - 7),
      ArrowDown: () => new Date(f.getFullYear(), f.getMonth(), f.getDate() + 7),
      PageUp: () => new Date(f.getFullYear(), f.getMonth() - 1, f.getDate()),
      PageDown: () => new Date(f.getFullYear(), f.getMonth() + 1, f.getDate()),
    };
    if (step[e.key]) {
      e.preventDefault();
      const n = step[e.key]();
      setFocus(ymd(n));
      if (n.getMonth() !== m || n.getFullYear() !== y) setMonth(new Date(n.getFullYear(), n.getMonth(), 1));
    } else if ((e.key === "Enter" || e.key === " ") && !disabled(focus)) {
      e.preventDefault();
      onPick(focus);
    }
  }
  useEffect(() => {
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [focus, month]);

  return (
    <div className="dtp-cal">
      <div className="dtp-head">
        <button type="button" className="dtp-nav" aria-label="이전 달" onClick={() => setMonth(new Date(y, m - 1, 1))}>‹</button>
        <b>{y}년 {m + 1}월</b>
        <button type="button" className="dtp-nav" aria-label="다음 달" onClick={() => setMonth(new Date(y, m + 1, 1))}>›</button>
      </div>
      <div className="dtp-wd">{WD.map((w, i) => <span key={w} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>{w}</span>)}</div>
      <div className="dtp-grid" ref={gridRef} onKeyDown={onKey} role="grid">
        {cells.map((d) => {
          const k = ymd(d);
          const out = d.getMonth() !== m;
          const dis = disabled(k);
          return (
            <button
              type="button" key={k} data-day={k} disabled={dis} tabIndex={k === focus ? 0 : -1}
              className={`dtp-day${out ? " out" : ""}${k === today ? " today" : ""}${k === value ? " sel" : ""}${d.getDay() === 0 ? " sun" : d.getDay() === 6 ? " sat" : ""}`}
              aria-label={fmtDateLabel(k)} aria-pressed={k === value}
              onClick={() => onPick(k)}
            >{d.getDate()}</button>
          );
        })}
      </div>
      <div className="dtp-quick">
        {[["오늘", 0], ["내일", 1], ["모레", 2]].map(([l, n]) => {
          const t = new Date(); t.setDate(t.getDate() + (n as number));
          const k = ymd(t);
          return <button type="button" key={l} className="dtp-chip" disabled={disabled(k)} onClick={() => onPick(k)}>{l}</button>;
        })}
      </div>
    </div>
  );
}

/* ── 시간 ── */
export function TimeField({
  value, onChange, minuteStep = 5, ...rest
}: BaseProps & { value: string; onChange: (v: string) => void; minuteStep?: number }) {
  const { open, setOpen, triggerRef, popRef, pos } = usePopover();
  const variant = rest.variant ?? "field";
  const h = value ? Number(value.slice(0, 2)) : null;
  const mm = value ? Number(value.slice(3, 5)) : null;
  const minutes = Array.from({ length: 60 / minuteStep }, (_, i) => i * minuteStep);
  if (mm !== null && !minutes.includes(mm)) minutes.push(mm), minutes.sort((a, b) => a - b); // 5분 단위가 아닌 기존 값도 표시
  const hourCol = useRef<HTMLDivElement>(null);
  const minCol = useRef<HTMLDivElement>(null);

  // 열면 선택된 시·분이 보이게 스크롤
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      for (const col of [hourCol.current, minCol.current]) {
        const sel = col?.querySelector<HTMLElement>(".sel");
        if (col && sel) col.scrollTop = sel.offsetTop - col.clientHeight / 2 + sel.offsetHeight / 2;
      }
    });
  }, [open]);

  const set = (nh: number, nm: number) => onChange(`${pad(nh)}:${pad(nm)}`);
  return (
    <>
      <button
        type="button" id={rest.id} ref={triggerRef} disabled={rest.disabled}
        className={`dtp dtp-${variant}${open ? " open" : ""}${!value ? " empty" : ""} ${rest.className ?? ""}`}
        aria-haspopup="dialog" aria-expanded={open} aria-label={rest["aria-label"] ? `${rest["aria-label"]}: ${fmtTimeLabel(value) || "선택 안 함"}` : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {rest.children ?? (
          <>
            {variant !== "bare" && <ClockIcon />}
            <span className="dtp-text">{fmtTimeLabel(value) || rest.placeholder || "시간 선택"}</span>
          </>
        )}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={popRef} className="dtp-pop dtp-time" role="dialog" aria-label="시간 선택"
          style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}>
          <div className="dtp-time-cols">
            <div className="dtp-colwrap">
            <div className="dtp-col-head">시</div>
            <div className="dtp-col" ref={hourCol} aria-label="시">
              {Array.from({ length: 24 }, (_, i) => i).map((i) => (
                <button type="button" key={i} className={`dtp-cell${h === i ? " sel" : ""}`} onClick={() => set(i, mm ?? 0)}>
                  <em>{i < 12 ? "오전" : "오후"}</em>{i % 12 === 0 ? 12 : i % 12}
                </button>
              ))}
            </div>
            </div>
            <div className="dtp-colwrap">
            <div className="dtp-col-head">분</div>
            <div className="dtp-col" ref={minCol} aria-label="분">
              {minutes.map((i) => (
                <button type="button" key={i} className={`dtp-cell${mm === i ? " sel" : ""}`} onClick={() => { set(h ?? 9, i); setOpen(false); triggerRef.current?.focus(); }}>
                  {pad(i)}
                </button>
              ))}
            </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function CalIcon() {
  return (
    <svg className="dtp-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg className="dtp-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" />
    </svg>
  );
}
