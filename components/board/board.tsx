"use client";

// 예약 현황 보드 — 날짜 선택 + 그리드 + 예약 모달 + 30초 폴링.
// 데스크톱: 8개 회의실 전체, sticky 헤더/시간열, Delete/Esc 키 지원.
// 모바일: 층별 탭 + 터치 스와이프(transform 방식) 전환.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Modal, Spinner, cn } from "@/components/ui";
import { MonthCalendar } from "@/components/board/calendar";
import { GridHeader, ReservationGrid } from "@/components/board/grid";
import { ReservationModal, type ModalState } from "@/components/board/reservation-modal";
import type { ConflictInfo, Holiday, Me, ReservationDTO, Room } from "@/components/board/types";
import { addDays, formatDateWithWeekday, isValidDateStr, kstTodayStr, minToLabel } from "@/lib/time";
import { CalendarDays, ChevronLeft, ChevronRight, DoorOpen, Users } from "lucide-react";

type Props = {
  me: Me;
  initialDate?: string;
  focusId?: string;
};

type Scope = "one" | "following" | "all";

type PendingAction =
  | { kind: "move"; res: ReservationDTO; patch: { roomId: number; startMin: number; endMin: number } }
  | { kind: "delete"; res: ReservationDTO };

export function ReservationBoard({ me, initialDate, focusId }: Props) {
  const [date, setDate] = useState(() =>
    initialDate && isValidDateStr(initialDate) ? initialDate : kstTodayStr()
  );
  const [rooms, setRooms] = useState<Room[]>([]);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [reservations, setReservations] = useState<ReservationDTO[]>([]);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(focusId ? [focusId] : [])
  );
  const [infoRoom, setInfoRoom] = useState<Room | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [pendingScope, setPendingScope] = useState<Scope>("one");
  const [pendingBusy, setPendingBusy] = useState(false);
  const [pendingError, setPendingError] = useState("");
  const [partialAsk, setPartialAsk] = useState<{
    action: PendingAction & { kind: "move" };
    scope: Scope;
    conflicts: ConflictInfo[];
    availableCount: number;
  } | null>(null);
  const [activeFloorIdx, setActiveFloorIdx] = useState(0);
  // 좁은 화면(모바일 가로 회전 등)에서는 칼럼 최소폭을 없애 8실이 스크롤 없이 들어가게
  const [fitCols, setFitCols] = useState(false);
  const calRef = useRef<HTMLDivElement>(null);
  const focusScrolled = useRef(false);
  const touchState = useRef<{ x: number; y: number; axis: "none" | "h" | "v" } | null>(null);

  const today = kstTodayStr();
  const isToday = date === today;

  const showToast = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    setToast({ text, kind });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  /** 클릭=단일 선택(재클릭 해제) / Ctrl(Cmd)+클릭=다중 선택 토글 / null=전체 해제 */
  const handleSelect = useCallback((id: string | null, additive = false) => {
    setSelectedIds((prev) => {
      if (id === null) return prev.size === 0 ? prev : new Set();
      const next = new Set(prev);
      if (additive) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      if (prev.size === 1 && prev.has(id)) return new Set();
      return new Set([id]);
    });
  }, []);

  const fetchReservations = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/api/reservations?date=${d}`);
      if (!res.ok) return;
      const data = await res.json();
      setReservations(data.reservations);
    } catch {
      /* 다음 폴링에서 회복 */
    }
  }, []);

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

  useEffect(() => {
    const update = () => setFitCols(window.innerWidth < 1024);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // 내 예약/검색에서 "이동"으로 진입 시 해당 예약으로 스크롤
  useEffect(() => {
    if (!focusId || focusScrolled.current || reservations.length === 0) return;
    const el = document.getElementById(`res-${focusId}`);
    if (el) {
      focusScrolled.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusId, reservations]);

  // 달력 팝오버 외부 클릭 닫기
  useEffect(() => {
    if (!calOpen) return;
    function onDown(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setCalOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [calOpen]);

  // Delete = 선택 예약 취소 (다중 선택 시 일괄) / Esc = 선택 해제
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") {
        handleSelect(null);
        return;
      }
      if (e.key !== "Delete" || selectedIds.size === 0 || modal || pending) return;
      const targets = reservations.filter((r) => selectedIds.has(r.id));
      if (targets.length === 0) return;

      // 단일 선택: 기존 플로우 (반복이면 3옵션)
      if (targets.length === 1) {
        const res = targets[0];
        if (res.userId !== me.id && me.role !== "ADMIN") {
          showToast("본인의 예약만 취소할 수 있습니다.", "error");
          return;
        }
        if (res.isRecurring) {
          setPendingScope("one");
          setPendingError("");
          setPending({ kind: "delete", res });
        } else if (confirm(`${res.roomNumber}호 ${minToLabel(res.startMin)}~${minToLabel(res.endMin)} 예약을 취소하시겠습니까?`)) {
          doDelete(res, "one");
        }
        return;
      }

      // 다중 선택: 일괄 취소 (반복 예약은 "이 일정만" — 사용자 확정 규칙)
      bulkDelete(targets);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, reservations, modal, pending, me]);

  async function bulkDelete(targets: ReservationDTO[]) {
    const editable = targets.filter((r) => r.userId === me.id || me.role === "ADMIN");
    const skipped = targets.length - editable.length;
    if (editable.length === 0) {
      showToast("취소할 수 있는 본인 예약이 없습니다.", "error");
      return;
    }
    let msg = `선택한 ${editable.length}건의 예약을 취소하시겠습니까?`;
    if (skipped > 0) msg += `\n(타인 예약 ${skipped}건은 제외됩니다)`;
    if (editable.some((r) => r.isRecurring)) msg += `\n반복 예약은 선택한 일정만 취소됩니다.`;
    if (!confirm(msg)) return;

    const results = await Promise.all(
      editable.map((r) =>
        fetch(`/api/reservations/${r.id}?scope=one`, { method: "DELETE" })
          .then((res) => res.ok)
          .catch(() => false)
      )
    );
    const ok = results.filter(Boolean).length;
    const failed = results.length - ok;
    handleSelect(null);
    fetchReservations(date);
    if (failed > 0) showToast(`${ok}건 취소, ${failed}건 실패했습니다.`, "error");
    else showToast(skipped > 0 ? `본인 예약 ${ok}건만 취소되었습니다.` : `${ok}건의 예약이 취소되었습니다.`);
  }

  const floors = useMemo(() => {
    const fs = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
    return fs.map((floor) => ({ floor, rooms: rooms.filter((r) => r.floor === floor) }));
  }, [rooms]);

  /* ----- 서버 호출 ----- */

  async function doPatch(
    res: ReservationDTO,
    patch: { roomId: number; startMin: number; endMin: number },
    scope: Scope,
    onlyAvailable = false
  ) {
    try {
      const resp = await fetch(`/api/reservations/${res.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, scope, onlyAvailable }),
      });
      const data = await resp.json();
      if (resp.ok) {
        const skipped: string[] = data.skippedDates ?? [];
        showToast(
          skipped.length > 0
            ? `${data.createdCount}건 변경되었습니다. 겹치는 ${skipped.length}개 날짜는 제외되었습니다.`
            : "예약이 변경되었습니다."
        );
        return;
      }
      if (resp.status === 409 && data.availableDates?.length > 0 && scope !== "one") {
        setPartialAsk({
          action: { kind: "move", res, patch },
          scope,
          conflicts: data.conflicts ?? [],
          availableCount: data.availableDates.length,
        });
        return;
      }
      showToast(data.error ?? "변경에 실패했습니다.", "error");
    } catch {
      showToast("서버에 연결할 수 없습니다.", "error");
    } finally {
      fetchReservations(date);
    }
  }

  async function doDelete(res: ReservationDTO, scope: Scope) {
    try {
      const resp = await fetch(`/api/reservations/${res.id}?scope=${scope}`, { method: "DELETE" });
      const data = await resp.json();
      if (!resp.ok) {
        showToast(data.error ?? "취소에 실패했습니다.", "error");
        return;
      }
      handleSelect(null);
      showToast(data.deletedCount > 1 ? `${data.deletedCount}건의 예약이 취소되었습니다.` : "예약이 취소되었습니다.");
    } catch {
      showToast("서버에 연결할 수 없습니다.", "error");
    } finally {
      fetchReservations(date);
    }
  }

  /** 그리드 드래그/스트레치 커밋 — 반복 예약이면 적용 범위를 먼저 묻는다 (일관성) */
  const commitChange = useCallback(
    (res: ReservationDTO, patch: { roomId: number; startMin: number; endMin: number }) => {
      if (!res.isRecurring) {
        doPatch(res, patch, "one");
        return;
      }
      setPendingScope("one");
      setPendingError("");
      setPending({ kind: "move", res, patch });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date]
  );

  async function confirmPending() {
    if (!pending) return;
    setPendingBusy(true);
    try {
      if (pending.kind === "move") {
        await doPatch(pending.res, pending.patch, pendingScope);
      } else {
        await doDelete(pending.res, pendingScope);
      }
      setPending(null);
    } finally {
      setPendingBusy(false);
    }
  }

  /* ----- 모바일 스와이프 (transform 방식 — 탭/세로 스크롤과 충돌 없음) ----- */

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchState.current = { x: t.clientX, y: t.clientY, axis: "none" };
  }
  function onTouchMove(e: React.TouchEvent) {
    const s = touchState.current;
    if (!s) return;
    const t = e.touches[0];
    if (s.axis === "none") {
      const dx = Math.abs(t.clientX - s.x);
      const dy = Math.abs(t.clientY - s.y);
      if (dx > 12 || dy > 12) s.axis = dx > dy ? "h" : "v";
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = touchState.current;
    touchState.current = null;
    if (!s || s.axis !== "h") return;
    const dx = e.changedTouches[0].clientX - s.x;
    if (Math.abs(dx) < 50) return;
    setActiveFloorIdx((idx) => {
      const next = dx < 0 ? idx + 1 : idx - 1;
      return Math.max(0, Math.min(floors.length - 1, next));
    });
  }

  const holidayName = holidays.get(date);
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();

  const gridShared = {
    reservations,
    me,
    selectedIds,
    onSelect: handleSelect,
    onCreate: (roomId: number, startMin: number, endMin: number) => {
      if (date < today) {
        showToast("지난 날짜는 예약할 수 없습니다.", "error");
        return;
      }
      setModal({ mode: "create", roomId, date, startMin, endMin });
    },
    onOpen: (r: ReservationDTO) => setModal({ mode: "edit", reservation: r }),
    onCommit: commitChange,
    onRoomInfo: setInfoRoom,
  };

  return (
    <main className="mx-auto max-w-7xl px-3 sm:px-4 pt-2 pb-4">
      {/* 툴바 */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
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
              <CalendarDays size={16} className="text-accent" />
              {formatDateWithWeekday(date)}
              {holidayName && <span className="text-[12px] font-medium text-red-400">{holidayName}</span>}
            </button>
            {calOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-card rounded-xl border border-line shadow-lg p-3 animate-fade-in-up">
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
          클릭=선택 · 더블클릭/드래그=예약 · 예약 더블클릭=수정 · 가장자리 드래그=시간 변경 · Delete=취소
        </p>
      </div>

      {rooms.length === 0 ? (
        <div className="py-24 text-center text-gray-400 text-sm">회의실 정보를 불러오는 중...</div>
      ) : (
        <>
          {/* 데스크톱 */}
          <div className="hidden sm:block">
            <ReservationGrid
              rooms={rooms}
              slotHeight={27}
              minColWidth={fitCols ? 0 : 110}
              stickyHeader
              {...gridShared}
            />
          </div>

          {/* 모바일: 층별 탭 + 스와이프 */}
          <div className="sm:hidden">
            <div className="flex gap-1 mb-2 bg-gray-100 rounded-xl p-1">
              {floors.map((f, idx) => (
                <button
                  key={f.floor}
                  onClick={() => setActiveFloorIdx(idx)}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-sm font-semibold transition-colors cursor-pointer",
                    idx === activeFloorIdx ? "bg-accent text-white shadow-sm" : "text-gray-500"
                  )}
                >
                  {f.floor}층
                </button>
              ))}
            </div>
            {/* 회의실행: 스와이프 영역 밖에 sticky로 고정 (transform과 sticky는 공존 불가) */}
            {floors[activeFloorIdx] && (
              <div className="sticky top-14 z-30 rounded-t-xl border border-line border-b-line-strong bg-gray-100 overflow-hidden">
                <GridHeader rooms={floors[activeFloorIdx].rooms} onRoomInfo={setInfoRoom} />
              </div>
            )}
            <div
              className="overflow-hidden"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <div
                className="flex transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-${activeFloorIdx * 100}%)` }}
              >
                {floors.map((f) => (
                  <div key={f.floor} className="w-full shrink-0">
                    <ReservationGrid
                      rooms={f.rooms}
                      slotHeight={18}
                      minColWidth={0} // 완전 유동폭 — 좁은 폰(360px)에서도 가로 오버플로 없이 화면에 딱 맞게
                      stickyHeader={false}
                      hideHeader
                      {...gridShared}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* 예약 생성/수정 모달 */}
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

      {/* 회의실 정보 모달 */}
      {infoRoom && (
        <Modal open onClose={() => setInfoRoom(null)} title={`${infoRoom.number}호`} maxWidth="max-w-xs">
          <div className="space-y-2.5 text-sm text-gray-700">
            <p className="flex items-center gap-2">
              <DoorOpen size={15} className="text-accent" /> {infoRoom.floor}층
              {infoRoom.alias ? ` ${infoRoom.alias}` : ""}
            </p>
            {infoRoom.capacity && (
              <p className="flex items-center gap-2">
                <Users size={15} className="text-accent" /> 수용 인원 {infoRoom.capacity}명
              </p>
            )}
            {infoRoom.description ? (
              <p className="whitespace-pre-line bg-gray-50 rounded-lg px-3 py-2.5 text-[13px] leading-relaxed">
                {infoRoom.description}
              </p>
            ) : (
              !infoRoom.capacity && <p className="text-gray-400 text-[13px]">등록된 정보가 없습니다.</p>
            )}
          </div>
        </Modal>
      )}

      {/* 반복 예약 변경/취소 적용 범위 (드래그·Delete키용) */}
      {pending && (
        <Modal
          open
          onClose={() => setPending(null)}
          title={pending.kind === "move" ? "반복 예약 변경" : "반복 예약 취소"}
          maxWidth="max-w-sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              {pending.kind === "move"
                ? `${pending.res.roomNumber}호 예약을 ${minToLabel(pending.patch.startMin)}~${minToLabel(pending.patch.endMin)}으로 변경합니다. 어디에 적용할까요?`
                : "반복 예약을 어떻게 취소할까요?"}
            </p>
            <div className="flex flex-col gap-2">
              {(
                [
                  ["one", "이 일정만"],
                  ["following", "이 일정 및 향후 일정"],
                  ["all", "모든 일정"],
                ] as [Scope, string][]
              ).map(([s, label]) => (
                <label
                  key={s}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm cursor-pointer transition-colors",
                    pendingScope === s ? "border-accent bg-accent-soft" : "border-line hover:bg-gray-50"
                  )}
                >
                  <input
                    type="radio"
                    checked={pendingScope === s}
                    onChange={() => setPendingScope(s)}
                    className="accent-[var(--accent)]"
                  />
                  {label}
                </label>
              ))}
            </div>
            {pendingError && <Alert>{pendingError}</Alert>}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setPending(null)} disabled={pendingBusy}>
                취소
              </Button>
              <Button
                variant={pending.kind === "delete" ? "danger" : "primary"}
                onClick={confirmPending}
                disabled={pendingBusy}
              >
                {pendingBusy ? <Spinner /> : pending.kind === "move" ? "변경" : "예약 취소"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 반복 변경 부분 충돌 확인 */}
      {partialAsk && (
        <Modal open onClose={() => setPartialAsk(null)} title="일부 날짜가 겹칩니다" maxWidth="max-w-sm">
          <div className="space-y-3">
            <div className="max-h-36 overflow-y-auto thin-scroll rounded-lg border border-line divide-y divide-line text-[13px]">
              {partialAsk.conflicts.flatMap((c) =>
                c.items.map((item) => (
                  <div key={`${c.date}-${item.id}`} className="px-3 py-2">
                    <b>{formatDateWithWeekday(c.date)}</b>{" "}
                    <span className="text-gray-500">
                      {minToLabel(item.startMin)}~{minToLabel(item.endMin)}
                    </span>{" "}
                    · {item.userName}
                  </div>
                ))
              )}
            </div>
            <p className="text-sm text-gray-700">
              변경 가능한 <b>{partialAsk.availableCount}개</b> 날짜에 한해 변경하시겠습니까?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setPartialAsk(null)}>
                아니오
              </Button>
              <Button
                onClick={() => {
                  const p = partialAsk;
                  setPartialAsk(null);
                  doPatch(p.action.res, p.action.patch, p.scope, true);
                }}
              >
                예, 가능한 날짜만 변경
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 토스트 */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg animate-fade-in-up",
            toast.kind === "ok" ? "bg-neutral-900/90" : "bg-red-600/95"
          )}
        >
          {toast.text}
        </div>
      )}
    </main>
  );
}
