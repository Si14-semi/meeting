"use client";

// 반복 규칙 편집기 — 구글캘린더 컨셉 (매일/매주/매월/매년/맞춤 + 종료조건)

import { cn, Input, Select } from "@/components/ui";
import { weekdayOf, weekdayKo } from "@/lib/time";
import type { RecurrenceInput } from "@/components/board/types";

type Preset = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "CUSTOM";

type Props = {
  anchorDate: string; // 반복 시작일 (예약 날짜)
  value: RecurrenceInput | null;
  custom: boolean; // 맞춤 모드 여부 (UI 상태)
  onChange: (value: RecurrenceInput | null, custom: boolean) => void;
};

const WD = ["일", "월", "화", "수", "목", "금", "토"];

export function defaultRecurrence(anchorDate: string, frequency: RecurrenceInput["frequency"]): RecurrenceInput {
  return {
    frequency,
    interval: 1,
    weekdays: frequency === "WEEKLY" ? [weekdayOf(anchorDate)] : [],
    monthlyMode: frequency === "MONTHLY" ? "DAY_OF_MONTH" : null,
    endDate: null,
    count: null,
  };
}

export function RecurrenceEditor({ anchorDate, value, custom, onChange }: Props) {
  const preset: Preset = value === null ? "NONE" : custom ? "CUSTOM" : value.frequency;

  function setPreset(p: Preset) {
    if (p === "NONE") return onChange(null, false);
    if (p === "CUSTOM") {
      return onChange(value ?? defaultRecurrence(anchorDate, "WEEKLY"), true);
    }
    onChange(defaultRecurrence(anchorDate, p), false);
  }

  const endMode = value?.endDate ? "date" : value?.count ? "count" : "none";
  const dayOfMonth = parseInt(anchorDate.slice(8));
  const nth = Math.ceil(dayOfMonth / 7);

  return (
    <div className="space-y-3">
      <Select
        value={preset}
        onChange={(e) => setPreset(e.target.value as Preset)}
        aria-label="반복"
      >
        <option value="NONE">반복 안 함</option>
        <option value="DAILY">매일</option>
        <option value="WEEKLY">매주 {weekdayKo(anchorDate)}요일</option>
        <option value="MONTHLY">매월 {dayOfMonth}일</option>
        <option value="YEARLY">매년 {parseInt(anchorDate.slice(5, 7))}월 {dayOfMonth}일</option>
        <option value="CUSTOM">맞춤...</option>
      </Select>

      {value && custom && (
        <div className="rounded-xl border border-line bg-gray-50/60 p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600 shrink-0">반복 주기:</span>
            <Input
              type="number"
              min={1}
              max={99}
              value={value.interval}
              onChange={(e) =>
                onChange({ ...value, interval: Math.max(1, parseInt(e.target.value) || 1) }, true)
              }
              className="w-16 h-9 text-center"
            />
            <Select
              value={value.frequency}
              onChange={(e) => {
                const f = e.target.value as RecurrenceInput["frequency"];
                onChange(
                  {
                    ...value,
                    frequency: f,
                    weekdays: f === "WEEKLY" ? (value.weekdays.length ? value.weekdays : [weekdayOf(anchorDate)]) : [],
                    monthlyMode: f === "MONTHLY" ? (value.monthlyMode ?? "DAY_OF_MONTH") : null,
                  },
                  true
                );
              }}
              className="w-24 h-9"
            >
              <option value="DAILY">일</option>
              <option value="WEEKLY">주</option>
              <option value="MONTHLY">개월</option>
              <option value="YEARLY">년</option>
            </Select>
            <span className="text-gray-600">마다</span>
          </div>

          {value.frequency === "WEEKLY" && (
            <div className="flex gap-1">
              {WD.map((label, wd) => {
                const active = value.weekdays.includes(wd);
                return (
                  <button
                    key={wd}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? value.weekdays.filter((d) => d !== wd)
                        : [...value.weekdays, wd].sort();
                      if (next.length === 0) return; // 최소 1개 요일
                      onChange({ ...value, weekdays: next }, true);
                    }}
                    className={cn(
                      "h-8 w-8 rounded-full text-[13px] font-medium transition-colors cursor-pointer",
                      active ? "bg-accent text-white" : "bg-white border border-line text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {value.frequency === "MONTHLY" && (
            <Select
              value={value.monthlyMode ?? "DAY_OF_MONTH"}
              onChange={(e) =>
                onChange({ ...value, monthlyMode: e.target.value as "DAY_OF_MONTH" | "NTH_WEEKDAY" }, true)
              }
              className="h-9"
            >
              <option value="DAY_OF_MONTH">매월 {dayOfMonth}일</option>
              <option value="NTH_WEEKDAY">
                매월 {nth >= 5 ? "마지막" : `${nth}번째`} {weekdayKo(anchorDate)}요일
              </option>
            </Select>
          )}
        </div>
      )}

      {value && (
        <div className="space-y-2">
          <div className="text-[13px] font-medium text-gray-600">종료</div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="end-mode"
                checked={endMode === "none"}
                onChange={() => onChange({ ...value, endDate: null, count: null }, custom)}
                className="accent-[var(--accent)]"
              />
              <span>없음 (1년간 반복)</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="end-mode"
                checked={endMode === "date"}
                onChange={() => onChange({ ...value, endDate: anchorDate, count: null }, custom)}
                className="accent-[var(--accent)]"
              />
              <span className="shrink-0">종료일:</span>
              <Input
                type="date"
                value={value.endDate ?? ""}
                min={anchorDate}
                disabled={endMode !== "date"}
                onChange={(e) => onChange({ ...value, endDate: e.target.value || anchorDate, count: null }, custom)}
                className="h-9 w-40 disabled:bg-gray-100 disabled:text-gray-400"
              />
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="end-mode"
                checked={endMode === "count"}
                onChange={() => onChange({ ...value, endDate: null, count: 10 }, custom)}
                className="accent-[var(--accent)]"
              />
              <span className="shrink-0">횟수:</span>
              <Input
                type="number"
                min={1}
                max={400}
                value={value.count ?? ""}
                disabled={endMode !== "count"}
                onChange={(e) =>
                  onChange({ ...value, endDate: null, count: Math.max(1, parseInt(e.target.value) || 1) }, custom)
                }
                className="h-9 w-20 text-center disabled:bg-gray-100 disabled:text-gray-400"
              />
              <span className="text-gray-500">회</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
