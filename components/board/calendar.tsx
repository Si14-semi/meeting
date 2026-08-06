"use client";

// 월 달력 — 날짜 선택, 주말·공휴일 시각 구분 (일/공휴일=빨강, 토=파랑)

import { useMemo, useState } from "react";
import { cn } from "@/components/ui";
import { kstTodayStr } from "@/lib/time";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  holidays: Map<string, string>;
};

export function MonthCalendar({ value, onChange, holidays }: Props) {
  const [viewYm, setViewYm] = useState(() => value.slice(0, 7)); // YYYY-MM
  const today = kstTodayStr();

  const weeks = useMemo(() => {
    const [y, m] = viewYm.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const startOffset = first.getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${viewYm}-${String(d).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewYm]);

  function moveMonth(delta: number) {
    const [y, m] = viewYm.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setViewYm(d.toISOString().slice(0, 7));
  }

  const [vy, vm] = viewYm.split("-").map(Number);

  return (
    <div className="select-none w-[280px]">
      <div className="flex items-center justify-between mb-2 px-1">
        <button
          onClick={() => moveMonth(-1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"
          aria-label="이전 달"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-sm font-semibold">
          {vy}년 {vm}월
        </div>
        <button
          onClick={() => moveMonth(1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"
          aria-label="다음 달"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-gray-400 mb-1">
        {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
          <div key={d} className={cn(i === 0 && "text-red-400", i === 6 && "text-blue-400")}>
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((date, di) => {
            if (!date) return <div key={di} className="h-9" />;
            const holiday = holidays.get(date);
            const isSelected = date === value;
            const isToday = date === today;
            const dayNum = parseInt(date.slice(8));
            return (
              <button
                key={di}
                onClick={() => onChange(date)}
                title={holiday}
                className={cn(
                  "h-9 flex items-center justify-center rounded-lg text-[13px] font-medium transition-colors cursor-pointer",
                  isSelected
                    ? "bg-accent text-white shadow-sm"
                    : cn(
                        "hover:bg-gray-100",
                        holiday || di === 0 ? "text-red-500" : di === 6 ? "text-blue-500" : "text-gray-700"
                      ),
                  isToday && !isSelected && "ring-1 ring-accent/50"
                )}
              >
                {dayNum}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
