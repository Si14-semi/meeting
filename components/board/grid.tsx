"use client";

// 예약 그리드 — 가로축 회의실 × 세로축 시간(09:00~19:00, 15분 단위).
//
// 인터랙션 (데스크톱 마우스 / 모바일 터치 공통 컨셉):
//  - 빈 영역: 클릭(탭)=슬롯 선택, 같은 곳 다시 클릭=해제, 더블클릭(더블탭)=예약창,
//    드래그(데스크톱만)=범위 지정 후 예약창
//  - 예약 블록: 클릭=선택(재클릭 해제), 더블클릭=수정창,
//    가운데 드래그=이동, 위/아래 가장자리(8px) 드래그=시간 스트레치 (데스크톱만)
//  - Delete/Esc 처리는 board 담당 (선택 상태는 board 소유)
//
// 레이아웃: 헤더(회의실행)는 GridHeader로 분리 —
//  - 데스크톱: 그리드 내부에서 sticky + 가로 스크롤 동기화
//  - 모바일: board가 스와이프 영역 밖에 sticky로 렌더 (hideHeader)
// 층 경계 겹선은 소수 픽셀 어긋남을 피하려고 border 대신 전용 구분선 요소로 그린다.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { cn } from "@/components/ui";
import { colorForUser } from "@/components/board/palette";
import type { Me, ReservationDTO, Room } from "@/components/board/types";
import { OPEN_MIN, CLOSE_MIN, SLOT_MIN, SLOTS_PER_DAY, minToLabel } from "@/lib/time";
import { Repeat } from "lucide-react";

const GUTTER_W = 56; // 시간 눈금 열 너비
const EDGE_PX = 8; // 블록 상/하단 스트레치 감지 영역

type DragState =
  | { type: "create"; roomIdx: number; anchorSlot: number; currentSlot: number }
  | { type: "move"; res: ReservationDTO; grabOffsetSlots: number; curRoomIdx: number; curStartSlot: number }
  | { type: "resize-top"; res: ReservationDTO; curSlot: number }
  | { type: "resize-bottom"; res: ReservationDTO; curSlot: number };

type EmptySel = { roomIdx: number; startSlot: number; endSlot: number };

function floorBoundaries(rooms: Room[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < rooms.length; i++) {
    if (rooms[i].floor !== rooms[i - 1].floor) out.push(i);
  }
  return out;
}

/** 층 경계 겹선 (1px 실선 2개, 정수 픽셀) */
function FloorDividers({ boundaries, count }: { boundaries: number[]; count: number }) {
  return (
    <>
      {boundaries.map((i) => (
        <div
          key={i}
          aria-hidden
          className="absolute inset-y-0 w-[3px] -translate-x-1/2 border-l border-r border-line-strong pointer-events-none z-[5]"
          style={{ left: `${(i / count) * 100}%` }}
        />
      ))}
    </>
  );
}

/* ===== 회의실 헤더행 (데스크톱: 그리드 내부 / 모바일: board가 외부에 sticky 렌더) ===== */

export function GridHeader({
  rooms,
  onRoomInfo,
}: {
  rooms: Room[];
  onRoomInfo: (room: Room) => void;
}) {
  const boundaries = useMemo(() => floorBoundaries(rooms), [rooms]);
  const [tip, setTip] = useState<{ room: Room; x: number; y: number } | null>(null);

  return (
    <div className="flex bg-gray-50">
      <div style={{ width: GUTTER_W }} className="shrink-0 sticky left-0 z-10 bg-gray-50" aria-hidden />
      <div className="flex flex-1 relative">
        {rooms.map((room, i) => (
          <button
            key={room.id}
            onClick={() => onRoomInfo(room)}
            onMouseEnter={(e) => {
              if (!window.matchMedia("(hover: hover)").matches) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setTip({ room, x: rect.left + rect.width / 2, y: rect.bottom });
            }}
            onMouseLeave={() => setTip(null)}
            className={cn(
              "flex-1 py-2 text-center cursor-pointer hover:bg-accent-soft transition-colors group",
              "border-l border-line",
              boundaries.includes(i) && "border-l-transparent"
            )}
          >
            <span className="text-sm font-bold text-gray-800 group-hover:text-accent">
              {room.number}호
            </span>
          </button>
        ))}
        <FloorDividers boundaries={boundaries} count={rooms.length} />
      </div>
      {/* hover 툴팁 — overflow 클리핑을 피해 fixed로 렌더 */}
      {tip && (
        <div
          className="fixed z-[70] -translate-x-1/2 bg-gray-900 text-white text-[12px] leading-relaxed rounded-lg px-3 py-2 w-max max-w-52 whitespace-pre-line text-left shadow-lg pointer-events-none"
          style={{ left: tip.x, top: tip.y + 6 }}
        >
          <b>
            {tip.room.number}호 · {tip.room.floor}층{tip.room.alias ? ` ${tip.room.alias}` : ""}
          </b>
          {"\n"}
          {[tip.room.capacity ? `수용 인원 ${tip.room.capacity}명` : null, tip.room.description]
            .filter(Boolean)
            .join("\n") || "등록된 정보 없음"}
        </div>
      )}
    </div>
  );
}

/* ===== 그리드 본체 ===== */

type Props = {
  rooms: Room[];
  reservations: ReservationDTO[];
  me: Me;
  slotHeight: number; // 데스크톱 27 / 모바일 18
  minColWidth: number;
  stickyHeader: boolean;
  hideHeader?: boolean; // 모바일: board가 헤더를 밖에서 렌더
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (roomId: number, startMin: number, endMin: number) => void;
  onOpen: (res: ReservationDTO) => void;
  onCommit: (res: ReservationDTO, patch: { roomId: number; startMin: number; endMin: number }) => void;
  onRoomInfo: (room: Room) => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ReservationGrid({
  rooms,
  reservations,
  me,
  slotHeight,
  minColWidth,
  stickyHeader,
  hideHeader = false,
  selectedId,
  onSelect,
  onCreate,
  onOpen,
  onCommit,
  onRoomInfo,
}: Props) {
  const headScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [emptySel, setEmptySel] = useState<EmptySel | null>(null);
  const dragMoved = useRef(false);

  const bodyHeight = SLOTS_PER_DAY * slotHeight;
  const minTotalWidth = GUTTER_W + rooms.length * minColWidth;
  const boundaries = useMemo(() => floorBoundaries(rooms), [rooms]);

  const byRoom = useMemo(() => {
    const map = new Map<number, ReservationDTO[]>();
    for (const room of rooms) map.set(room.id, []);
    for (const r of reservations) map.get(r.roomId)?.push(r);
    return map;
  }, [rooms, reservations]);

  const canEdit = useCallback(
    (r: ReservationDTO) => r.userId === me.id || me.role === "ADMIN",
    [me]
  );

  const locate = useCallback(
    (clientX: number, clientY: number) => {
      const el = colsRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const colW = rect.width / rooms.length;
      const roomIdx = clamp(Math.floor((clientX - rect.left) / colW), 0, rooms.length - 1);
      const slot = clamp(Math.floor((clientY - rect.top) / slotHeight), 0, SLOTS_PER_DAY - 1);
      return { roomIdx, slot };
    },
    [rooms.length, slotHeight]
  );

  const syncScroll = useCallback(() => {
    if (headScrollRef.current && bodyScrollRef.current) {
      headScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
    }
  }, []);

  /** 빈 슬롯 클릭 → 선택, 같은 선택 영역 재클릭 → 해제 */
  const toggleEmptySel = useCallback((roomIdx: number, slot: number) => {
    setEmptySel((prev) =>
      prev && prev.roomIdx === roomIdx && slot >= prev.startSlot && slot < prev.endSlot
        ? null
        : { roomIdx, startSlot: slot, endSlot: slot + 1 }
    );
  }, []);

  // 드래그 중 전역 pointermove/up
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
    function onUp() {
      const d = drag;
      setDrag(null);
      if (!d) return;
      if (d.type === "create") {
        const lo = Math.min(d.anchorSlot, d.currentSlot);
        const hi = Math.max(d.anchorSlot, d.currentSlot);
        if (dragMoved.current && hi > lo) {
          onCreate(rooms[d.roomIdx].id, OPEN_MIN + lo * SLOT_MIN, OPEN_MIN + (hi + 1) * SLOT_MIN);
          setEmptySel(null);
        } else {
          toggleEmptySel(d.roomIdx, d.anchorSlot);
        }
        return;
      }
      if (!dragMoved.current) return;
      if (d.type === "move") {
        const newRoomId = rooms[d.curRoomIdx].id;
        const newStart = OPEN_MIN + d.curStartSlot * SLOT_MIN;
        if (newRoomId !== d.res.roomId || newStart !== d.res.startMin) {
          onCommit(d.res, {
            roomId: newRoomId,
            startMin: newStart,
            endMin: newStart + (d.res.endMin - d.res.startMin),
          });
        }
        return;
      }
      if (d.type === "resize-top") {
        const newStart = OPEN_MIN + d.curSlot * SLOT_MIN;
        if (newStart !== d.res.startMin) {
          onCommit(d.res, { roomId: d.res.roomId, startMin: newStart, endMin: d.res.endMin });
        }
        return;
      }
      const newEnd = OPEN_MIN + (d.curSlot + 1) * SLOT_MIN;
      if (newEnd !== d.res.endMin) {
        onCommit(d.res, { roomId: d.res.roomId, startMin: d.res.startMin, endMin: newEnd });
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, locate, onCommit, onCreate, rooms, toggleEmptySel]);

  // Esc → 빈 슬롯 선택 해제
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEmptySel(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 시간 라벨: 10:00~18:00 (09:00·19:00 미표기 — 사용자 확정)
  const hourLabels = useMemo(() => {
    const marks: number[] = [];
    for (let m = OPEN_MIN + 60; m < CLOSE_MIN; m += 60) marks.push(m);
    return marks;
  }, []);

  function openCreateAt(roomIdx: number, slot: number) {
    // 선택된 범위가 여러 슬롯이고 그 안이면 그 범위, 아니면 클릭 지점부터 1시간
    let startMin: number, endMin: number;
    if (
      emptySel &&
      emptySel.roomIdx === roomIdx &&
      emptySel.endSlot - emptySel.startSlot > 1 &&
      slot >= emptySel.startSlot &&
      slot < emptySel.endSlot
    ) {
      startMin = OPEN_MIN + emptySel.startSlot * SLOT_MIN;
      endMin = OPEN_MIN + emptySel.endSlot * SLOT_MIN;
    } else {
      startMin = OPEN_MIN + slot * SLOT_MIN;
      endMin = Math.min(startMin + 60, CLOSE_MIN);
    }
    onCreate(rooms[roomIdx].id, startMin, endMin);
    setEmptySel(null);
  }

  return (
    <div
      className={cn(
        "reservation-grid bg-card border border-line",
        hideHeader ? "rounded-b-xl border-t-0" : "rounded-xl"
      )}
    >
      {!hideHeader && (
        <div
          ref={headScrollRef}
          className={cn(
            "overflow-hidden rounded-t-xl border-b border-line-strong bg-gray-50",
            stickyHeader && "sticky top-14 z-30 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          )}
        >
          <div style={{ minWidth: minTotalWidth }}>
            <GridHeader rooms={rooms} onRoomInfo={onRoomInfo} />
          </div>
        </div>
      )}

      <div
        ref={bodyScrollRef}
        onScroll={syncScroll}
        className="overflow-x-auto thin-scroll rounded-b-xl"
      >
        <div className="flex" style={{ minWidth: minTotalWidth }}>
          {/* 시간 눈금 (가로 스크롤 시 고정) */}
          <div
            style={{ width: GUTTER_W, height: bodyHeight }}
            className="shrink-0 sticky left-0 z-20 bg-card relative"
            aria-hidden
          >
            {hourLabels.map((m) => (
              <div
                key={m}
                className="absolute right-2 text-[13px] font-semibold text-gray-900 leading-none -translate-y-1/2"
                style={{ top: ((m - OPEN_MIN) / SLOT_MIN) * slotHeight }}
              >
                {minToLabel(m)}
              </div>
            ))}
          </div>

          {/* 칼럼 영역 */}
          <div ref={colsRef} className="flex flex-1 relative" style={{ height: bodyHeight }}>
            {Array.from({ length: SLOTS_PER_DAY - 1 }, (_, k) => {
              const i = k + 1;
              const isHour = i % 4 === 0;
              return (
                <div
                  key={i}
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 pointer-events-none",
                    isHour ? "border-t border-line-strong" : "border-t border-dashed border-line/80"
                  )}
                  style={{ top: i * slotHeight }}
                />
              );
            })}

            {rooms.map((room, idx) => {
              const items = byRoom.get(room.id) ?? [];
              return (
                <div
                  key={room.id}
                  className={cn(
                    "flex-1 relative border-l border-line",
                    boundaries.includes(idx) && "border-l-transparent"
                  )}
                  onPointerDown={(e) => {
                    if (e.pointerType !== "mouse" || e.button !== 0) return;
                    if ((e.target as HTMLElement).closest("[data-block]")) return;
                    const loc = locate(e.clientX, e.clientY);
                    if (!loc) return;
                    dragMoved.current = false;
                    onSelect(null);
                    setDrag({ type: "create", roomIdx: idx, anchorSlot: loc.slot, currentSlot: loc.slot });
                    e.preventDefault();
                  }}
                  onDoubleClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-block]")) return;
                    const loc = locate(e.clientX, e.clientY);
                    if (!loc) return;
                    openCreateAt(idx, loc.slot);
                  }}
                  onClick={(e) => {
                    // 터치 탭 → 선택 토글 (더블탭이 예약창)
                    if ((e.target as HTMLElement).closest("[data-block]")) return;
                    if ((e.nativeEvent as PointerEvent).pointerType === "mouse") return;
                    const loc = locate(e.clientX, e.clientY);
                    if (!loc) return;
                    onSelect(null);
                    toggleEmptySel(idx, loc.slot);
                  }}
                >
                  {items.map((r) => (
                    <ReservationBlock
                      key={r.id}
                      r={r}
                      me={me}
                      slotHeight={slotHeight}
                      editable={canEdit(r)}
                      selected={selectedId === r.id}
                      dimmed={!!drag && drag.type !== "create" && "res" in drag && drag.res.id === r.id}
                      onStartDrag={(type, grabOffsetSlots) => {
                        dragMoved.current = false;
                        if (type === "move") {
                          setDrag({
                            type: "move",
                            res: r,
                            grabOffsetSlots,
                            curRoomIdx: idx,
                            curStartSlot: (r.startMin - OPEN_MIN) / SLOT_MIN,
                          });
                        } else if (type === "resize-top") {
                          setDrag({ type: "resize-top", res: r, curSlot: (r.startMin - OPEN_MIN) / SLOT_MIN });
                        } else {
                          setDrag({ type: "resize-bottom", res: r, curSlot: (r.endMin - OPEN_MIN) / SLOT_MIN - 1 });
                        }
                      }}
                      onToggleSelect={() => {
                        if (dragMoved.current) return;
                        onSelect(selectedId === r.id ? null : r.id);
                        setEmptySel(null);
                      }}
                      onDoubleClick={() => onOpen(r)}
                    />
                  ))}

                  {emptySel && emptySel.roomIdx === idx && !drag && (
                    <Overlay
                      startSlot={emptySel.startSlot}
                      endSlot={emptySel.endSlot}
                      slotHeight={slotHeight}
                      label={`${minToLabel(OPEN_MIN + emptySel.startSlot * SLOT_MIN)}~${minToLabel(OPEN_MIN + emptySel.endSlot * SLOT_MIN)}`}
                      variant="select"
                    />
                  )}
                  {drag?.type === "create" && drag.roomIdx === idx && (
                    <Overlay
                      startSlot={Math.min(drag.anchorSlot, drag.currentSlot)}
                      endSlot={Math.max(drag.anchorSlot, drag.currentSlot) + 1}
                      slotHeight={slotHeight}
                      label={`${minToLabel(OPEN_MIN + Math.min(drag.anchorSlot, drag.currentSlot) * SLOT_MIN)}~${minToLabel(OPEN_MIN + (Math.max(drag.anchorSlot, drag.currentSlot) + 1) * SLOT_MIN)}`}
                      variant="select"
                    />
                  )}
                  {drag?.type === "move" && drag.curRoomIdx === idx && (
                    <Overlay
                      startSlot={drag.curStartSlot}
                      endSlot={drag.curStartSlot + (drag.res.endMin - drag.res.startMin) / SLOT_MIN}
                      slotHeight={slotHeight}
                      label={`${minToLabel(OPEN_MIN + drag.curStartSlot * SLOT_MIN)}~${minToLabel(OPEN_MIN + drag.curStartSlot * SLOT_MIN + (drag.res.endMin - drag.res.startMin))}`}
                      variant="ghost"
                    />
                  )}
                  {drag &&
                    (drag.type === "resize-top" || drag.type === "resize-bottom") &&
                    drag.res.roomId === room.id && (
                      <Overlay
                        startSlot={
                          drag.type === "resize-top" ? drag.curSlot : (drag.res.startMin - OPEN_MIN) / SLOT_MIN
                        }
                        endSlot={
                          drag.type === "resize-top" ? (drag.res.endMin - OPEN_MIN) / SLOT_MIN : drag.curSlot + 1
                        }
                        slotHeight={slotHeight}
                        label={
                          drag.type === "resize-top"
                            ? `${minToLabel(OPEN_MIN + drag.curSlot * SLOT_MIN)}~${minToLabel(drag.res.endMin)}`
                            : `${minToLabel(drag.res.startMin)}~${minToLabel(OPEN_MIN + (drag.curSlot + 1) * SLOT_MIN)}`
                        }
                        variant="ghost"
                      />
                    )}
                </div>
              );
            })}

            <FloorDividers boundaries={boundaries} count={rooms.length} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- 예약 블록 ---------- */

function ReservationBlock({
  r,
  me,
  slotHeight,
  editable,
  selected,
  dimmed,
  onStartDrag,
  onToggleSelect,
  onDoubleClick,
}: {
  r: ReservationDTO;
  me: Me;
  slotHeight: number;
  editable: boolean;
  selected: boolean;
  dimmed: boolean;
  onStartDrag: (type: "move" | "resize-top" | "resize-bottom", grabOffsetSlots: number) => void;
  onToggleSelect: () => void;
  onDoubleClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const color = colorForUser(r.userId);
  const top = ((r.startMin - OPEN_MIN) / SLOT_MIN) * slotHeight;
  const height = ((r.endMin - r.startMin) / SLOT_MIN) * slotHeight;
  const compact = height <= slotHeight * 2;

  function zoneAt(clientY: number): "move" | "resize-top" | "resize-bottom" {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || !editable) return "move";
    const y = clientY - rect.top;
    if (y <= EDGE_PX) return "resize-top";
    if (y >= rect.height - EDGE_PX) return "resize-bottom";
    return "move";
  }

  return (
    <div
      ref={ref}
      data-block
      id={`res-${r.id}`}
      className={cn(
        "absolute inset-x-0.5 rounded-md border overflow-hidden transition-shadow",
        editable ? "cursor-grab" : "cursor-pointer",
        selected && "ring-2 ring-accent shadow-md z-10",
        dimmed && "opacity-40"
      )}
      style={{
        top: top + 1,
        height: height - 2,
        background: color.bg,
        borderColor: r.userId === me.id ? "var(--accent)" : color.border,
        borderLeftWidth: 3,
        borderLeftColor: color.text,
        color: color.text,
        paddingLeft: 6,
        paddingRight: 6,
        paddingTop: 2,
      }}
      title={`${minToLabel(r.startMin)}~${minToLabel(r.endMin)} ${r.userName}${r.purpose ? " — " + r.purpose : ""}`}
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse" || e.button !== 0) return;
        e.stopPropagation();
        if (!editable) return;
        const zone = zoneAt(e.clientY);
        const rect = ref.current!.getBoundingClientRect();
        const grabOffsetSlots = Math.floor((e.clientY - rect.top) / slotHeight);
        onStartDrag(zone, grabOffsetSlots);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || !editable || !ref.current) return;
        const zone = zoneAt(e.clientY);
        ref.current.style.cursor = zone === "move" ? "grab" : "ns-resize";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onToggleSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
    >
      <div className={cn("leading-tight", compact && "flex items-baseline gap-1 truncate")}>
        <span className="text-[11px] font-bold flex items-center gap-0.5 truncate">
          {r.userName}
          {r.isRecurring && <Repeat size={9} className="shrink-0 opacity-70" />}
        </span>
        {r.purpose && (
          <span className={cn("text-[11px] opacity-80 truncate", !compact && "block")}>{r.purpose}</span>
        )}
        {!compact && height > slotHeight * 3 && (
          <span className="text-[10px] opacity-60 block">
            {minToLabel(r.startMin)}~{minToLabel(r.endMin)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------- 오버레이 (선택 / 드래그 미리보기) ---------- */

function Overlay({
  startSlot,
  endSlot,
  slotHeight,
  label,
  variant,
}: {
  startSlot: number;
  endSlot: number;
  slotHeight: number;
  label: string;
  variant: "select" | "ghost";
}) {
  return (
    <div
      className={cn(
        "absolute inset-x-0.5 rounded-md pointer-events-none flex items-start justify-center",
        variant === "select"
          ? "bg-accent/10 border-2 border-accent/60 z-10"
          : "bg-accent/20 border-2 border-accent z-20"
      )}
      style={{ top: startSlot * slotHeight, height: (endSlot - startSlot) * slotHeight }}
    >
      <span className="text-[11px] font-semibold text-accent mt-0.5">{label}</span>
    </div>
  );
}
