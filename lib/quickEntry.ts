// 개인 일정 한 줄 빠른 입력 — "내일 오후 3시~5시 촬영 연습" → 날짜·시간·제목으로 분해 (브라우저 로컬 시각 기준)
// 텔레그램 /개인 문법(7/20, 금요일, 14-16, 장소:…)도 그대로 받는다.
// 지원 예: 오늘·내일·모레·글피, 금요일, 다음주 화요일, 11/20, 11.20, 11월 20일, 20일, 2026-11-20,
//         기간 11/20~11/22, 오후 3시, 3시 반, 15:00, 오후 3시~5시, 14-16, 장소:체육관, @체육관

export type QuickParsed = {
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  allDay: boolean;
  startTime: string; // HH:mm (allDay면 무시)
  endTime: string;
  location: string;
  dateFound: boolean; // false면 기본 날짜를 쓴 것
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const WD: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

const DATE_ATOM =
  "(?:\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/.]\\d{1,2}|\\d{1,2}월\\s*\\d{1,2}일|\\d{1,2}일|오늘|내일|모레|글피|(?:(?:다음|이번)\\s*주\\s*)?[월화수목금토일]요일)";
const DATE_RANGE_RE = new RegExp(`(^|\\s)(${DATE_ATOM})\\s*(?:[-~]|부터)\\s*(${DATE_ATOM})(?:까지)?(?=\\s|$)`);
const DATE_ONE_RE = new RegExp(`(^|\\s)(${DATE_ATOM})(?:에|부터|까지)?(?=\\s|$)`);

// 분·반은 "시" 뒤에서만 ("3-4반" 같은 제목을 시간으로 오인하지 않게)
const TA = "(오전|오후|아침|낮|저녁|밤|새벽)?\\s*(\\d{1,2})(?::(\\d{2}))?(?:(시)(?:\\s*(\\d{1,2})분|\\s*(반))?)?";
const TIME_RE = new RegExp(`(^|\\s)${TA}(?:\\s*(?:[-~]|부터)\\s*${TA})?(?:까지|에|부터)?(?=\\s|$)`);

function parseDateAtom(raw: string, now: Date): Date | null {
  const s = raw.replace(/\s+/g, "");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const plus = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  const rel = ["오늘", "내일", "모레", "글피"].indexOf(s);
  if (rel >= 0) return plus(rel);

  let m = s.match(/^(다음주|이번주)?([월화수목금토일])요일$/);
  if (m) {
    const target = WD[m[2]];
    const dow = today.getDay();
    if (m[1] === "다음주") {
      const toNextMon = (8 - dow) % 7 || 7;
      return plus(toNextMon + ((target + 6) % 7)); // 월=0 … 일=6
    }
    return plus((target - dow + 7) % 7); // 다가오는 그 요일 (오늘 포함)
  }

  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[/.](\d{1,2})$/) ?? s.match(/^(\d{1,2})월(\d{1,2})일$/);
  if (m) {
    const mo = +m[1], d = +m[2];
    // 반년 넘게 지난 달이면 내년으로 (12월에 "1/5" 입력)
    const y = mo < today.getMonth() + 1 - 6 ? today.getFullYear() + 1 : today.getFullYear();
    return valid(y, mo, d);
  }

  m = s.match(/^(\d{1,2})일$/);
  if (m) {
    // 이번 달 그 날 — 이미 지났으면 다음 달
    const d = +m[1];
    const cand = valid(today.getFullYear(), today.getMonth() + 1, d);
    if (cand && cand >= today) return cand;
    return valid(today.getFullYear(), today.getMonth() + 2, d);
  }
  return null;
}

function valid(y: number, mo: number, d: number): Date | null {
  const dt = new Date(y, mo - 1, d);
  // 월 넘김(예: 2/30) 보정은 허용하지 않음. mo가 13이면 Date가 다음 해 1월로 넘겨줌
  const expectMonth = ((mo - 1) % 12 + 12) % 12;
  if (dt.getMonth() !== expectMonth || dt.getDate() !== d) return null;
  return dt;
}

const PM = new Set(["오후", "낮", "저녁", "밤"]);
const AM = new Set(["오전", "아침", "새벽"]);
function to24(mer: string | undefined, h: number) {
  if (mer && PM.has(mer)) return h < 12 ? h + 12 : h;
  if (mer && AM.has(mer)) return h === 12 ? 0 : h;
  return h;
}

export function parseQuickEntry(input: string, fallbackDay: string, now = new Date()): QuickParsed {
  let rest = ` ${input.trim()} `;

  // 장소 — "장소:" 뒤 끝까지, 또는 "@단어"
  let location = "";
  const locM = rest.match(/\s장소\s*:\s*(.+)$/);
  if (locM) { location = locM[1].trim(); rest = rest.slice(0, locM.index) + " "; }
  else {
    const at = rest.match(/\s@(\S+)/);
    if (at) { location = at[1]; rest = rest.replace(at[0], " "); }
  }

  // 날짜 (기간 우선)
  let start: Date | null = null, end: Date | null = null;
  const rm = rest.match(DATE_RANGE_RE);
  if (rm) {
    const a = parseDateAtom(rm[2], now), b = parseDateAtom(rm[3], now);
    if (a && b) { start = a; end = b < a ? a : b; rest = rest.replace(rm[0], " "); }
  }
  if (!start) {
    const om = rest.match(DATE_ONE_RE);
    if (om) {
      const a = parseDateAtom(om[2], now);
      if (a) { start = end = a; rest = rest.replace(om[0], " "); }
    }
  }

  // 시간
  let startTime = "", endTime = "";
  // 앞에서부터 후보를 훑어 첫 "시간다운" 것만 사용 — "5 회의 오후 3시"의 5처럼 숫자만 있는 건 건너뜀
  const timeRe = new RegExp(TIME_RE.source, "g");
  for (const tm of Array.from(rest.matchAll(timeRe))) {
    const [, , mer1, h1s, mm1, si1, min1, ban1, mer2, h2s, mm2, , min2, ban2] = tm;
    const isRange = h2s !== undefined;
    // 숫자만 있는 건 "14-16"처럼 범위일 때만 시간으로 본다 (제목의 숫자 보호)
    if (!(mer1 || mm1 || si1 || isRange)) continue;
    const h1 = +h1s;
    const m1 = mm1 ? +mm1 : min1 ? +min1 : ban1 ? 30 : 0;
    // 오전/오후 없이 "3시"처럼 1~7시면 오후로 (새벽 일정은 드묾). 15:00·07:30 같은 콜론 표기는 그대로
    const sh = !mer1 && !mm1 && h1 >= 1 && h1 <= 7 ? h1 + 12 : to24(mer1, h1);
    let eh: number, em: number;
    if (isRange) {
      const h2 = +h2s;
      em = mm2 ? +mm2 : min2 ? +min2 : ban2 ? 30 : 0;
      if (mer2) eh = to24(mer2, h2);
      else if (mer1 && PM.has(mer1) && h2 < 12) eh = h2 + 12;
      else if (!mer1 && !mm2 && h2 >= 1 && h2 <= 7) eh = h2 + 12;
      else eh = h2;
      if (eh * 60 + em <= sh * 60 + m1 && eh < 12) eh += 12; // "11-1" → 11:00–13:00
    } else {
      eh = sh + 1; em = m1; // 시작만 있으면 1시간
    }
    if (sh > 23 || m1 > 59 || eh > 24 || em > 59) continue;
    startTime = `${pad2(sh)}:${pad2(m1)}`;
    const endMin = Math.min(eh * 60 + em, 23 * 60 + 59);
    endTime = `${pad2(Math.floor(endMin / 60))}:${pad2(endMin % 60)}`;
    rest = rest.slice(0, tm.index) + " " + rest.slice(tm.index! + tm[0].length);
    break;
  }

  const title = rest
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(에|부터|까지|,)\s*/, "")
    .replace(/\s*(에|,)$/, "");

  const sd = start ? ymd(start) : fallbackDay;
  const ed = end ? ymd(end) : sd;
  return {
    title,
    startDate: sd,
    endDate: ed,
    allDay: !startTime,
    startTime: startTime || "10:00",
    endTime: endTime || "11:00",
    location,
    dateFound: !!start,
  };
}
