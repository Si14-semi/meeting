"use client";

// 예약 그리드 — 가로축 회의실 × 세로축 시간(08:00~19:00, 15분 단위).
// 데스크톱: 빈 영역 드래그로 생성, 블록 클릭=선택, 더블클릭=수정,
//           드래그=시간·회의실 이동, 위/아래 핸들 스트레치=시간 변경.
// 모바일: 탭으로 생성/열람만 (드래그 없음 — 사용자 확정 사항).

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { cn } from "@/components/ui";
import { colorForUser } from "@/components/board/palette";
import type { Me, ReservationDTO, Room } from "@/components/board/types";
import { OPEN_MIN, CLOSE_MIN, SLOT_MIN, SLOTS_PER_DAY, minToLabel } from "@/lib/time";
import { Repeat } from "lucide-react";

const SLOT_H = 18; // px per 15min
const GUTTER_W = 52; // 시간 눈금 열 너비

type DragState =
  | { type: "create"; roomIdx: number; anchorSlot: number; currentSlot: number }
  | { type: "move"; res: ReservationDTO; grabOffsetSlots: number; curRoomIdx: number; curStartSlot: number }
  | { type: "resize-top"; res: ReservationDTO; curSlot: number }
  | { type: "resize-bottom"; res: ReservationDTO; curSlot: number };

type Props = {
  rooms: Room[]; // 표시할 회의실 (모바일은 층별 부분집합)
  reservations: ReservationDTO[];
  me: Me;
  isToday: boolean;
  nowMin: number;
  onCreate: (roomId: number, startMin: number, endMin: number) => void;
  onOpen: (res: ReservationDTO) => void;
  onCommit: (res: ReservationDTO, patch: { roomId: number; startMin: number; endMin: number }) => Promise<boolean>;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ReservationGrid({ rooms, reservations, me, isToday, nowMin, onCreate, onOpen, onCommit }: Props) {
  const colsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragMoved = useRef(false);

  const byRoom = useMemo(() => {
    const map = new Map<number, ReservationDTO[]>();
    for (const room of rooms) map.set(room.id, []);
    for (const r of reservations) {
      map.get(r.roomId)?.push(r);
    }
    return map;
  }, [rooms, reservations]);

  const canEdit = useCallback(
    (r: ReservationDTO) => r.userId === me.id || me.role === "ADMIN",
    [me]
  );

  /** 포인터 좌표 → (roomIdx, slot) */
  const locate = useCallback(
    (clientX: number, clientY: number) => {
      const el = colsRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const colW = rect.width / rooms.length;
      const roomIdx = clamp(Math.floor((clientX - rect.left) / colW), 0, rooms.length - 1);
      const slot = clamp(Math.floor((clientY - rect.top) / SLOT_H), 0, SLOTS_PER_DAY - 1);
      return { roomIdx, slot };
    },
    [rooms.length]
  );

  // 드래그 중 전역 pointermove/up 처리
  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      const loc = locate(e.clientX, e.clientY);
      if (!loc) return;
      dragMoved.current = true;
      setDrag((d) => {
        if (!d) return d;
        if (d.type === "create") return { ...d, currentSlot: loc.slot };
        if (d.type === "move") {
          const durSlots = (d.res.endMin - d.res.startMin) / SLOT_MIN;
          const start = clamp(loc.slot - d.grabOffsetSlots, 0, SLOTS_PER_DAY - durSlots);
          return { ...d, curRoomIdx: loc.roomIdx, curStartSlot: start };
        }
        if (d.type === "resize-top") {
          const endSlot = (d.res.endMin - OPEN_MIN) / SLOT_MIN;
          return { ...d, curSlot: clamp(loc.slot, 0, endSlot - 1) };
        }
        const startSlot = (d.res.startMin - OPEN_MIN) / SLOT_MIN;
        return { ...d, curSlot: clamp(loc.slot, startSlot, SLOTS_PER_DAY - 1) };
      });
    }
    async function onUp() {
      const d = drag;
      setDrag(null);
      if (!d) return;
      if (d.type === "create") {
        const lo = Math.min(d.anchorSlot, d.currentSlot);
        const hi = Math.max(d.anchorSlot, d.currentSlot);
        const startMin = OPEN_MIN + lo * SLOT_MIN;
        const endMin = OPEN_MIN + (hi + 1) * SLOT_MIN;
        onCreate(rooms[d.roomIdx].id, startMin, endMin);
        return;
      }
      if (!dragMoved.current) return;
      if (d.type === "move") {
        const newRoomId = rooms[d.curRoomIdx].id;
        const newStart = OPEN_MIN + d.curStartSlot * SLOT_MIN;
        const newEnd = newStart + (d.res.endMin - d.res.startMin);
        if (newRoomId !== d.res.roomId || newStart !== d.res.startMin) {
          await onCommit(d.res, { roomId: newRoomId, startMin: newStart, endMin: newEnd });
        }
        return;
      }
      if (d.type === "resize-top") {
        const newStart = OPEN_MIN + d.curSlot * SLOT_MIN;
        if (newStart !== d.res.startMin) {
          await onCommit(d.res, { roomId: d.res.roomId, startMin: newStart, endMin: d.res.endMin });
        }
        return;
      }
      const newEnd = OPEN_MIN + (d.curSlot + 1) * SLOT_MIN;
      if (newEnd !== d.res.endMin) {
        await onCommit(d.res, { roomId: d.res.roomId, startMin: d.res.startMin, endMin: newEnd });
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, locate, onCommit, onCreate, rooms]);

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let m = OPEN_MIN; m <= CLOSE_MIN; m += 60) marks.push(m);
    return marks;
  }, []);

  const nowY = isToday && nowMin >= OPEN_MIN && nowMin <= CLOSE_MIN
    ? ((nowMin - OPEN_MIN) / SLOT_MIN) * SLOT_H
    : null;

  return (
    <div className="reservation-grid bg-card rounded-xl border border-line overflow-hidden">
      {/* 헤더: 회의실 이름 */}
      <div className="flex border-b border-line-strong bg-gray-50/80 sticky top-14 z-20">
        <div style={{ width: GUTTER_W }} className="shrink-0" />
        {rooms.map((room) => (
          <div key={room.id} className="flex-1 min-w-0 py-2.5 text-center border-l border-line">
            <div className="text-sm font-semibold leading-tight">{room.number}호</div>
            <div className="text-[11px] text-gray-400 leading-tight truncate px-1">
              {[room.capacity ? `${room.capacity}명` : null, room.equipment].filter(Boolean).join(" · ") || `${room.floor}층`}
            </div>
          </div>
        ))}
      </div>

      {/* 본체 */}
      <div className="flex relative">
        {/* 시간 눈금 */}
        <div style={{ width: GUTTER_W }} className="shrink-0 relative" aria-hidden>
          {hourMarks.map((m) => (
            <div
              key={m}
              className="absolute right-2 text-[11px] text-gray-400 font-medium -translate-y-1/2"
              style={{ top: ((m - OPEN_MIN) / SLOT_MIN) * SLOT_H }}
            >
              {minToLabel(m)}
            </div>
          ))}
          <div style={{ height: SLOTS_PER_DAY * SLOT_H }} />
        </div>

        {/* 칼럼 영역 */}
        <div
          ref={colsRef}
          className="flex flex-1 relative"
          style={{ height: SLOTS_PER_DAY * SLOT_H }}
        >
          {/* 수평선 (15분 점선 / 1시간 실선) */}
          {Array.from({ length: SLOTS_PER_DAY + 1 }, (_, i) => {
            const isHour = i % 4 === 0;
            return (
              <div
                key={i}
                aria-hidden
                className={cn(
                  "absolute inset-x-0 pointer-events-none",
                  isHour ? "border-t border-line-strong" : "border-t border-dashed border-line/80"
                )}
                style={{ top: i * SLOT_H }}
              />
            );
          })}

          {rooms.map((room, idx) => {
            const items = byRoom.get(room.id) ?? [];
            return (
              <div
                key={room.id}
                className="flex-1 min-w-0 relative border-l border-line"
                onPointerDown={(e) => {
                  // 데스크톱 마우스만 드래그 생성 (모바일 드래그 불가 — 확정 사항)
                  if (e.pointerType !== "mouse" || e.button !== 0) return;
                  if ((e.target as HTMLElement).closest("[data-block]")) return;
                  const loc = locate(e.clientX, e.clientY);
                  if (!loc) return;
                  dragMoved.current = false;
                  setSelectedId(null);
                  setDrag({ type: "create", roomIdx: idx, anchorSlot: loc.slot, currentSlot: loc.slot });
                  e.preventDefault();
                }}
                onClick={(e) => {
                  // 터치 탭 생성 (기본 1시간)
                  if ((e.target as HTMLElement).closest("[data-block]")) return;
                  if (drag) return;
                  // 마우스는 pointerdown에서 처리되므로 여기서는 터치만
                  if ((e.nativeEvent as PointerEvent).pointerType === "mouse") return;
                  const loc = locate(e.clientX, e.clientY);
                  if (!loc) return;
                  const startMin = OPEN_MIN + loc.slot * SLOT_MIN;
                  const endMin = Math.min(startMin + 60, CLOSE_MIN);
                  onCreate(room.id, startMin, endMin);
                }}
              >
                {items.map((r) => {
                  const isDragTarget =
                    drag &&
                    drag.type !== "create" &&
                    "res" in drag &&
                    drag.res.id === r.id;
                  const color = colorForUser(r.userId);
                  const top = ((r.startMin - OPEN_MIN) / SLOT_MIN) * SLOT_H;
                  const height = ((r.endMin - r.startMin) / SLOT_MIN) * SLOT_H;
                  const mine = canEdit(r);
                  const selected = selectedId === r.id;
                  const compact = height <= SLOT_H * 2;
                  return (
                    <div
                      key={r.id}
                      data-block
                      className={cn(
                        "absolute inset-x-0.5 rounded-md border px-1.5 py-0.5 overflow-hidden transition-shadow",
                        mine ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                        selected && "ring-2 ring-accent shadow-md z-10",
                        isDragTarget && "opacity-40"
                      )}
                      style={{
                        top: top + 1,
                        height: height - 2,
                        background: color.bg,
                        borderColor: r.userId === me.id ? "var(--accent)" : color.border,
                        color: color.text,
                      }}
                      title={`${minToLabel(r.startMin)}~${minToLabel(r.endMin)} ${r.userName}${r.purpose ? " — " + r.purpose : ""}`}
                      onPointerDown={(e) => {
                        if (e.pointerType !== "mouse" || e.button !== 0) return;
                        e.stopPropagation();
                        if (!mine) return;
                        const loc = locate(e.clientX, e.clientY);
                        if (!loc) return;
                        dragMoved.current = false;
                        const startSlot = (r.startMin - OPEN_MIN) / SLOT_MIN;
                        setDrag({
                          type: "move",
                          res: r,
                          grabOffsetSlots: loc.slot - startSlot,
                          curRoomIdx: idx,
                          curStartSlot: startSlot,
                        });
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (dragMoved.current) return; // 드래그 직후 클릭 무시
                        const isTouch = (e.nativeEvent as PointerEvent).pointerType !== "mouse";
                        if (isTouch) {
                          onOpen(r); // 모바일: 탭으로 바로 열기
                        } else {
                          setSelectedId(r.id); // 데스크톱: 클릭=선택
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onOpen(r); // 더블클릭=수정
                      }}
                    >
                      <div className={cn("leading-tight", compact ? "flex items-baseline gap-1 truncate" : "")}>
                        <span className="text-[11px] font-bold flex items-center gap-0.5 truncate">
                          {r.userName}
                          {r.isRecurring && <Repeat size={9} className="shrink-0 opacity-70" />}
                        </span>
                        {r.purpose && (
                          <span className={cn("text-[11px] opacity-80 truncate", !compact && "block")}>
                            {r.purpose}
                          </span>
                        )}
                        {!compact && height > SLOT_H * 3 && (
                          <span className="text-[10px] opacity-60 block">
                            {minToLabel(r.startMin)}~{minToLabel(r.endMin)}
                          </span>
                        )}
                      </div>
                      {/* 스트레치 핸들 (선택된 내 예약, 데스크톱) */}
                      {selected && mine && (
                        <>
                          <div
                            className="absolute inset-x-0 -top-0.5 h-2 cursor-ns-resize flex justify-center"
                            onPointerDown={(e) => {
                              if (e.pointerType !== "mouse") return;
                              e.stopPropagation();
                              dragMoved.current = false;
                              setDrag({ type: "resize-top", res: r, curSlot: (r.startMin - OPEN_MIN) / SLOT_MIN });
                              e.preventDefault();
                            }}
                          >
                            <div className="w-6 h-1 rounded-full bg-accent mt-0.5" />
                          </div>
                          <div
                            className="absolute inset-x-0 -bottom-0.5 h-2 cursor-ns-resize flex justify-center items-end"
                            onPointerDown={(e) => {
                              if (e.pointerType !== "mouse") return;
                              e.stopPropagation();
                              dragMoved.current = false;
                              setDrag({ type: "resize-bottom", res: r, curSlot: (r.endMin - OPEN_MIN) / SLOT_MIN - 1 });
                              e.preventDefault();
                            }}
                          >
                            <div className="w-6 h-1 rounded-full bg-accent mb-0.5" />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {/* 생성 드래그 미리보기 */}
                {drag?.type === "create" && drag.roomIdx === idx && (
                  <SelectionOverlay
                    startSlot={Math.min(drag.anchorSlot, drag.currentSlot)}
                    endSlot={Math.max(drag.anchorSlot, drag.currentSlot) + 1}
                  />
                )}
                {/* 이동 미리보기 */}
                {drag?.type === "move" && drag.curRoomIdx === idx && (
                  <GhostBlock
                    startSlot={drag.curStartSlot}
                    endSlot={drag.curStartSlot + (drag.res.endMin - drag.res.startMin) / SLOT_MIN}
                    label={`${minToLabel(OPEN_MIN + drag.curStartSlot * SLOT_MIN)}~${minToLabel(OPEN_MIN + drag.curStartSlot * SLOT_MIN + (drag.res.endMin - drag.res.startMin))}`}
                  />
                )}
                {/* 스트레치 미리보기 */}
                {drag && (drag.type === "resize-top" || drag.type === "resize-bottom") && drag.res.roomId === room.id && (
                  <GhostBlock
                    startSlot={
                      drag.type === "resize-top" ? drag.curSlot : (drag.res.startMin - OPEN_MIN) / SLOT_MIN
                    }
                    endSlot={
                      drag.type === "resize-top" ? (drag.res.endMin - OPEN_MIN) / SLOT_MIN : drag.curSlot + 1
                    }
                    label={
                      drag.type === "resize-top"
                        ? `${minToLabel(OPEN_MIN + drag.curSlot * SLOT_MIN)}~${minToLabel(drag.res.endMin)}`
                        : `${minToLabel(drag.res.startMin)}~${minToLabel(OPEN_MIN + (drag.curSlot + 1) * SLOT_MIN)}`
                    }
                  />
                )}
              </div>
            );
          })}

          {/* 현재 시각 라인 */}
          {nowY !== null && (
            <div className="absolute inset-x-0 pointer-events-none z-10" style={{ top: nowY }}>
              <div className="relative border-t-2 border-red-500/80">
                <div className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SelectionOverlay({ startSlot, endSlot }: { startSlot: number; endSlot: number }) {
  return (
    <div
      className="absolute inset-x-0.5 rounded-md bg-accent/15 border-2 border-accent/60 pointer-events-none z-10 flex items-start justify-center"
      style={{ top: startSlot * SLOT_H, height: (endSlot - startSlot) * SLOT_H }}
    >
      <span className="text-[11px] font-semibold text-accent mt-0.5">
        {minToLabel(OPEN_MIN + startSlot * SLOT_MIN)}~{minToLabel(OPEN_MIN + endSlot * SLOT_MIN)}
      </span>
    </div>
  );
}

function GhostBlock({ startSlot, endSlot, label }: { startSlot: number; endSlot: number; label: string }) {
  return (
    <div
      className="absolute inset-x-0.5 rounded-md bg-accent/20 border-2 border-accent pointer-events-none z-20 flex items-start justify-center"
      style={{ top: startSlot * SLOT_H, height: (endSlot - startSlot) * SLOT_H }}
    >
      <span className="text-[11px] font-semibold text-accent mt-0.5">{label}</span>
    </div>
  );
}
