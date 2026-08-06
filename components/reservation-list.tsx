"use client";

// 예약 목록 카드 — 내 예약 / 검색 결과 공용.
// 날짜와 요일을 함께 표기한다 (사용자 확정 사항).

import { cn } from "@/components/ui";
import type { ReservationDTO } from "@/components/board/types";
import { minToLabel } from "@/lib/time";
import { DoorOpen, Repeat } from "lucide-react";

type Props = {
  items: ReservationDTO[];
  onSelect?: (r: ReservationDTO) => void;
  dimmed?: boolean; // 지난 예약 스타일
  emptyText?: string;
};

export function ReservationList({ items, onSelect, dimmed, emptyText = "예약이 없습니다." }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-10">{emptyText}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelect?.(r)}
          disabled={!onSelect}
          className={cn(
            "w-full text-left bg-card rounded-xl border border-line px-4 py-3 flex items-center gap-3 transition-shadow",
            onSelect && "hover:shadow-md cursor-pointer",
            dimmed && "opacity-60"
          )}
        >
          <div className="shrink-0 h-10 w-10 rounded-lg bg-accent-soft text-accent flex flex-col items-center justify-center">
            <DoorOpen size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold">{r.roomNumber}호</span>
              <span className="text-[13px] text-gray-500">{r.dateLabel}</span>
              <span className="text-[13px] font-medium text-gray-700">
                {minToLabel(r.startMin)}~{minToLabel(r.endMin)}
              </span>
              {r.isRecurring && (
                <span className="inline-flex items-center gap-1 text-accent bg-accent-soft rounded-full px-1.5 py-0.5 text-[11px]">
                  <Repeat size={10} /> 반복
                </span>
              )}
            </div>
            <div className="text-[13px] text-gray-500 truncate mt-0.5">
              <span className="font-medium text-gray-600">{r.userName}</span>
              {r.purpose && <span> — {r.purpose}</span>}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
