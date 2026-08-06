"use client";

// 예약 현황 보드 — 날짜 선택 + 그리드 + 예약 모달 + 30초 폴링.
// 데스크톱: 8개 회의실 전체. 모바일: 층별 탭 + 가로 스와이프 전환.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, cn } from "@/components/ui";
import { MonthCalendar } from "@/components/board/calendar";
import { ReservationGrid } from "@/components/board/grid";
import { ReservationModal, type ModalState } from "@/components/board/reservation-modal";
import type { Holiday, Me, ReservationDTO, Room } from "@/components/board/types";
import { addDays, formatDateWithWeekday, kstNowMin, kstTodayStr } from "@/lib/time";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type Props = { me: Me };

export function ReservationBoard({ me }: Props) {
  const [date, setDate] = useState(() => kstTodayStr());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [reservations, setReservations] = useState<ReservationDTO[]>([]);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const [nowMin, setNowMin] = useState(() => kstNowMin());
  const [activeFloorIdx, setActiveFloorIdx] = useState(0);
  const swipeRef = useRef<HTMLDivElement>(null);
  const calRef = useRef<HTMLDivElement>(null);

  const today = kstTodayStr();
  const isToday = date === today;

  const showToast = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    setToast({ text, kind });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchReservations = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/api/reservations?date=${d}`);
      if (!res.ok) return;
      const data = await res.json();
      setReservations(data.reservations);
    } catch {
      /* 네트워크 오류는 다음 폴링에서 회복 */
    }
  }, []);

  // 초기 데이터 (회의실, 공휴일)
  useEffect(() => {
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []))
      .catch(() => {});
    fetch("/api/holidays")
      .then((r) => r.json())
      .then((d) => setHolidays(new Map((d.holidays ?? []).map((h: Holiday) => [h.date, h.name]))))
      .catch(() => {});
  }, []);

  // 날짜 변경 시 로드 + 30초 폴링 + 포커스 시 갱신
  useEffect(() => {
    fetchReservations(date);
    const interval = setInterval(() => fetchReservations(date), 30_000);
    const onFocus = () => fetchReservations(date);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [date, fetchReservations]);

  // 현재 시각 라인 (1분마다)
  useEffect(() => {
    const t = setInterval(() => setNowMin(kstNowMin()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 달력 팝오버 외부 클릭 닫기
  useEffect(() => {
    if (!calOpen) return;
    function onDown(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setCalOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [calOpen]);

  const floors = useMemo(() => {
    const fs = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
    return fs.map((floor) => ({ floor, rooms: rooms.filter((r) => r.floor === floor) }));
  }, [rooms]);

  // 모바일 스와이프 → 활성 탭 동기화
  function onSwipeScroll() {
    const el = swipeRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeFloorIdx) setActiveFloorIdx(idx);
  }
  function goFloor(idx: number) {
    setActiveFloorIdx(idx);
    swipeRef.current?.scrollTo({ left: idx * swipeRef.current.clientWidth, behavior: "smooth" });
  }

  const commitChange = useCallback(
    async (res: ReservationDTO, patch: { roomId: number; startMin: number; endMin: number }): Promise<boolean> => {
      try {
        const resp = await fetch(`/api/reservations/${res.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...patch, scope: "one" }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          showToast(data.error ?? "변경에 실패했습니다.", "error");
          return false;
        }
        showToast("예약이 변경되었습니다.");
        return true;
      } catch {
        showToast("서버에 연결할 수 없습니다.", "error");
        return false;
      } finally {
        fetchReservations(date);
      }
    },
    [date, fetchReservations, showToast]
  );

  const holidayName = holidays.get(date);
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();

  const gridProps = {
    reservations,
    me,
    isToday,
    nowMin,
    onCreate: (roomId: number, startMin: number, endMin: number) => {
      if (date < today) {
        showToast("지난 날짜는 예약할 수 없습니다.", "error");
        return;
      }
      setModal({ mode: "create", roomId, date, startMin, endMin });
    },
    onOpen: (r: ReservationDTO) => setModal({ mode: "edit", reservation: r }),
    onCommit: commitChange,
  };

  return (
    <main className="mx-auto max-w-7xl px-3 sm:px-4 py-4">
      {/* 툴바 */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => setDate(today)} disabled={isToday}>
            오늘
          </Button>
          <button
            onClick={() => setDate(addDays(date, -1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"
            aria-label="이전 날"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => setDate(addDays(date, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"
            aria-label="다음 날"
          >
            <ChevronRight size={18} />
          </button>
          <div className="relative" ref={calRef}>
            <button
              onClick={() => setCalOpen((v) => !v)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-gray-100 cursor-pointer",
                (holidayName || weekday === 0) && "text-red-500",
                weekday === 6 && !holidayName && "text-blue-500"
              )}
            >
              <CalendarDays size={16} className="text-gray-400" />
              {formatDateWithWeekday(date)}
              {holidayName && <span className="text-[12px] font-medium text-red-400">{holidayName}</span>}
            </button>
            {calOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl border border-line shadow-lg p-3 animate-fade-in-up">
                <MonthCalendar
                  value={date}
                  onChange={(d) => {
                    setDate(d);
                    setCalOpen(false);
                  }}
                  holidays={holidays}
                />
              </div>
            )}
          </div>
        </div>
        <p className="hidden lg:block text-[12px] text-gray-400">
          빈 시간을 드래그해 예약 · 클릭 선택 · 더블클릭 수정 · 드래그/모서리로 시간 변경
        </p>
      </div>

      {rooms.length === 0 ? (
        <div className="py-24 text-center text-gray-400 text-sm">회의실 정보를 불러오는 중...</div>
      ) : (
        <>
          {/* 데스크톱: 전체 회의실 */}
          <div className="hidden sm:block">
            <ReservationGrid rooms={rooms} {...gridProps} />
          </div>

          {/* 모바일: 층별 탭 + 스와이프 */}
          <div className="sm:hidden">
            <div className="flex gap-1 mb-2 bg-gray-100 rounded-xl p-1">
              {floors.map((f, idx) => (
                <button
                  key={f.floor}
                  onClick={() => goFloor(idx)}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-sm font-semibold transition-colors cursor-pointer",
                    idx === activeFloorIdx ? "bg-white text-accent shadow-sm" : "text-gray-500"
                  )}
                >
                  {f.floor}층
                </button>
              ))}
            </div>
            <div
              ref={swipeRef}
              onScroll={onSwipeScroll}
              className="flex overflow-x-auto snap-x snap-mandatory thin-scroll -mx-3 px-3 gap-3"
            >
              {floors.map((f) => (
                <div key={f.floor} className="snap-center shrink-0 w-full">
                  <ReservationGrid rooms={f.rooms} {...gridProps} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* 모달 */}
      {modal && (
        <ReservationModal
          state={modal}
          rooms={rooms}
          me={me}
          onClose={() => setModal(null)}
          onSaved={(message) => {
            setModal(null);
            fetchReservations(date);
            showToast(message ?? "예약이 저장되었습니다.");
          }}
        />
      )}

      {/* 토스트 */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg animate-fade-in-up",
            toast.kind === "ok" ? "bg-gray-900/90" : "bg-red-600/95"
          )}
        >
          {toast.text}
        </div>
      )}
    </main>
  );
}
