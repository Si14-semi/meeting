"use client";

// 예약 목록 카드 — 내 예약 / 검색 결과 공용.
// 클릭=선택(재클릭 해제), Ctrl(Cmd)+클릭=다중 선택, 더블클릭=수정,
// 이동 아이콘=예약 현황에서 해당 예약 보기.
// 내 예약은 인디고(브랜드색) 아이콘, 타인 예약은 회색 아이콘으로 구분 (그리드의 단색 톤 체계와 일치).

import { cn } from "@/components/ui";
import type { ReservationDTO } from "@/components/board/types";
import { minToLabel } from "@/lib/time";
import { DoorOpen, Repeat, SquareArrowOutUpRight } from "lucide-react";

type Props = {
  items: ReservationDTO[];
  meId?: string;
  selectedIds?: Set<string>;
  onSelect?: (r: ReservationDTO, additive: boolean) => void;
  onEdit?: (r: ReservationDTO) => void;
  onGoto?: (r: ReservationDTO) => void;
  dimWhen?: (r: ReservationDTO) => boolean; // 지난 예약 흐림 처리
  emptyText?: string;
};

export function ReservationList({
  items,
  meId,
  selectedIds,
  onSelect,
  onEdit,
  onGoto,
  dimWhen,
  emptyText = "예약이 없습니다.",
}: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-10">{emptyText}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((r) => {
        const dimmed = dimWhen?.(r) ?? false;
        const selected = selectedIds?.has(r.id) ?? false;
        const mine = meId !== undefined && r.userId === meId;
        return (
          <div
            key={r.id}
            onClick={(e) => onSelect?.(r, e.ctrlKey || e.metaKey)}
            onDoubleClick={() => onEdit?.(r)}
            className={cn(
              "relative w-full text-left bg-card rounded-xl border px-4 py-3 flex items-center gap-3 transition-all select-none overflow-hidden",
              (onSelect || onEdit) && "cursor-pointer hover:shadow-md",
              selected ? "border-accent ring-2 ring-accent/30" : "border-line",
              dimmed && "opacity-60"
            )}
          >
            <div
              className={cn(
                "shrink-0 h-10 w-10 rounded-lg flex items-center justify-center",
                meId === undefined || mine ? "bg-accent-soft text-accent" : "bg-gray-100 text-gray-500"
              )}
            >
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
            {onGoto && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onGoto(r);
                }}
                className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-accent hover:bg-accent-soft transition-colors cursor-pointer"
                title="예약 현황에서 보기"
                aria-label="예약 현황에서 보기"
              >
                <SquareArrowOutUpRight size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
