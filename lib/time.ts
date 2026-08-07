// 모든 날짜·시간은 KST 기준. 예약은 "YYYY-MM-DD" 문자열 + 자정 기준 분(min)으로 저장한다.
// 서버(Vercel)는 UTC로 돌기 때문에 Date.getHours() 등을 직접 쓰면 안 되고 반드시 이 헬퍼를 쓴다.

export const OPEN_MIN = 9 * 60; // 09:00 (사용자 확정: 시작시간 09:00)
export const CLOSE_MIN = 19 * 60; // 19:00
export const SLOT_MIN = 15;
export const SLOTS_PER_DAY = (CLOSE_MIN - OPEN_MIN) / SLOT_MIN; // 40

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 현재 KST 시각을 UTC 필드로 읽을 수 있는 Date로 반환 (getUTC*로 읽을 것) */
export function kstNow(): Date {
  return new Date(Date.now() + KST_OFFSET_MS);
}

/** 오늘 날짜 (KST) "YYYY-MM-DD" */
export function kstTodayStr(): string {
  return kstNow().toISOString().slice(0, 10);
}

/** 현재 KST 시각의 자정 기준 분 */
export function kstNowMin(): number {
  const n = kstNow();
  return n.getUTCHours() * 60 + n.getUTCMinutes();
}

/** 시간 범위 표기 — 운영시간 전체(09:00~19:00)면 "종일" */
export function rangeLabel(startMin: number, endMin: number): string {
  if (startMin === OPEN_MIN && endMin === CLOSE_MIN) return "종일";
  return `${minToLabel(startMin)}~${minToLabel(endMin)}`;
}

/** 480 → "08:00" */
export function minToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "08:00" → 480 (형식이 잘못되면 null) */
export function labelToMin(label: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(label.trim());
  if (!m) return null;
  const min = parseInt(m[1]) * 60 + parseInt(m[2]);
  return min >= 0 && min < 24 * 60 ? min : null;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** "YYYY-MM-DD" → 요일 인덱스 0(일)~6(토) */
export function weekdayOf(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getUTCDay();
}

/** "YYYY-MM-DD" → "월" 같은 한글 요일 */
export function weekdayKo(dateStr: string): string {
  return WEEKDAY_KO[weekdayOf(dateStr)];
}

/** "2026-08-06" → "2026-08-06 (목)" */
export function formatDateWithWeekday(dateStr: string): string {
  return `${dateStr} (${weekdayKo(dateStr)})`;
}

/** 날짜 문자열에 일수 더하기 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 날짜 문자열에 개월 더하기 (해당 일이 없는 달이면 null — 예: 1/31 + 1개월) */
export function addMonthsExact(dateStr: string, months: number): string | null {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
  if (day > lastDay) return null;
  d.setUTCDate(day);
  return d.toISOString().slice(0, 10);
}

/** 두 날짜 비교 (문자열 비교로 충분하지만 의도를 명확히) */
export function compareDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
