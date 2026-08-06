// 반복예약 규칙을 개별 날짜 목록으로 전개한다 (인스턴스 전개 방식).
// 종료일/횟수 미지정 시 시작일 + 1년까지 전개 (사용자 확정 사항).

import { addDays, addMonthsExact, weekdayOf } from "@/lib/time";

export type RecurrenceRule = {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number; // 1 이상
  weekdays: number[]; // WEEKLY용 0(일)~6(토), 비어있으면 시작일 요일
  monthlyMode: "DAY_OF_MONTH" | "NTH_WEEKDAY" | null;
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  count: number | null;
};

const MAX_HORIZON_DAYS = 366; // 미지정 시 1년
const MAX_INSTANCES = 400; // 안전 상한 (매일 × 1년 = 366)

/** n번째 요일 계산: 해당 월에서 weekday가 nth번째인 날짜. nth=5는 "마지막"으로 처리 */
function nthWeekdayOfMonth(year: number, month0: number, weekday: number, nth: number): string | null {
  const first = new Date(Date.UTC(year, month0, 1));
  const firstWeekday = first.getUTCDay();
  let day = 1 + ((weekday - firstWeekday + 7) % 7) + (nth - 1) * 7;
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  if (nth >= 5) {
    // "마지막 x요일"
    day = 1 + ((weekday - firstWeekday + 7) % 7);
    while (day + 7 <= lastDay) day += 7;
  } else if (day > lastDay) {
    return null;
  }
  return new Date(Date.UTC(year, month0, day)).toISOString().slice(0, 10);
}

/** 규칙을 날짜 목록으로 전개 (startDate 포함, 정렬됨) */
export function expandRule(rule: RecurrenceRule): string[] {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  const horizon = rule.endDate ?? addDays(rule.startDate, MAX_HORIZON_DAYS);
  const maxCount = rule.count ?? MAX_INSTANCES;
  const dates: string[] = [];

  const push = (d: string): boolean => {
    if (d > horizon) return false;
    if (d >= rule.startDate) {
      dates.push(d);
      if (dates.length >= Math.min(maxCount, MAX_INSTANCES)) return false;
    }
    return true;
  };

  if (rule.frequency === "DAILY") {
    let d = rule.startDate;
    while (push(d)) d = addDays(d, interval);
  } else if (rule.frequency === "WEEKLY") {
    const weekdays = rule.weekdays.length > 0 ? [...rule.weekdays].sort() : [weekdayOf(rule.startDate)];
    // 시작일이 속한 주의 일요일부터 interval주 간격으로 각 요일 전개
    let weekStart = addDays(rule.startDate, -weekdayOf(rule.startDate));
    outer: while (true) {
      for (const wd of weekdays) {
        const d = addDays(weekStart, wd);
        if (d < rule.startDate) continue;
        if (!push(d)) break outer;
      }
      weekStart = addDays(weekStart, 7 * interval);
      if (weekStart > horizon) break;
    }
  } else if (rule.frequency === "MONTHLY") {
    const mode = rule.monthlyMode ?? "DAY_OF_MONTH";
    if (mode === "DAY_OF_MONTH") {
      // 매월 같은 날짜. 없는 달(예: 31일)은 건너뜀 (구글캘린더와 동일)
      let months = 0;
      while (true) {
        const d = addMonthsExact(rule.startDate, months);
        if (d !== null && !push(d)) break;
        if (d === null) {
          const probe = addMonthsExact(rule.startDate.slice(0, 8) + "01", months);
          if (probe === null || probe > horizon) break;
        }
        months += interval;
        if (months > 12 * 50) break; // 안전장치
      }
    } else {
      // 매월 n번째 x요일 (예: 셋째 화요일)
      const start = new Date(rule.startDate + "T00:00:00Z");
      const weekday = start.getUTCDay();
      const nth = Math.ceil(start.getUTCDate() / 7);
      let months = 0;
      while (true) {
        const y = start.getUTCFullYear();
        const base = new Date(Date.UTC(y, start.getUTCMonth() + months, 1));
        if (base.toISOString().slice(0, 10) > horizon) break;
        const d = nthWeekdayOfMonth(base.getUTCFullYear(), base.getUTCMonth(), weekday, nth);
        if (d !== null && !push(d)) break;
        months += interval;
        if (months > 12 * 50) break;
      }
    }
  } else {
    // YEARLY: 매년 같은 월/일 (2/29는 윤년에만)
    const [, mm, dd] = rule.startDate.split("-");
    const startYear = parseInt(rule.startDate.slice(0, 4));
    let years = 0;
    while (true) {
      const y = startYear + years;
      const candidate = `${y}-${mm}-${dd}`;
      if (candidate > horizon) break;
      const valid = new Date(candidate + "T00:00:00Z").toISOString().slice(0, 10) === candidate;
      if (valid && !push(candidate)) break;
      years += interval;
      if (years > 100) break;
    }
  }

  return dates;
}

/** 반복 규칙을 사람이 읽는 요약으로 (예: "매주 화·목, 2026-12-31까지") */
export function describeRule(rule: RecurrenceRule): string {
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const iv = rule.interval > 1 ? `${rule.interval}` : "";
  let base: string;
  switch (rule.frequency) {
    case "DAILY":
      base = iv ? `${iv}일마다` : "매일";
      break;
    case "WEEKLY": {
      const days = (rule.weekdays.length > 0 ? rule.weekdays : [weekdayOf(rule.startDate)])
        .sort()
        .map((d) => WD[d])
        .join("·");
      base = iv ? `${iv}주마다 ${days}` : `매주 ${days}`;
      break;
    }
    case "MONTHLY": {
      const start = new Date(rule.startDate + "T00:00:00Z");
      if (rule.monthlyMode === "NTH_WEEKDAY") {
        const nth = Math.ceil(start.getUTCDate() / 7);
        const nthLabel = nth >= 5 ? "마지막" : `${nth}번째`;
        base = `${iv ? iv + "개월마다" : "매월"} ${nthLabel} ${WD[start.getUTCDay()]}요일`;
      } else {
        base = `${iv ? iv + "개월마다" : "매월"} ${start.getUTCDate()}일`;
      }
      break;
    }
    case "YEARLY":
      base = iv ? `${iv}년마다` : "매년";
      break;
  }
  if (rule.endDate) return `${base}, ${rule.endDate}까지`;
  if (rule.count) return `${base}, ${rule.count}회`;
  return `${base} (1년간)`;
}
