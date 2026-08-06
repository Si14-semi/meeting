"use client";

// 내 예약 모아보기 — 다가오는 예약(가까운 순) + 지난 예약 구분.
// 클릭=선택, Ctrl+클릭=다중 선택, 더블클릭=수정, Delete=선택 일괄 취소, 이동 아이콘=예약 현황.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn, Spinner } from "@/components/ui";
import { ReservationList } from "@/components/reservation-list";
import { ReservationModal } from "@/components/board/reservation-modal";
import type { Me, ReservationDTO, Room } from "@/components/board/types";
import { kstTodayStr } from "@/lib/time";

export function MyReservations({ me }: { me: Me }) {
  const router = useRouter();
  const [upcoming, setUpcoming] = useState<ReservationDTO[] | null>(null);
  const [past, setPast] = useState<ReservationDTO[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ReservationDTO | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/my");
      if (!res.ok) return;
      const data = await res.json();
      setUpcoming(data.upcoming);
      setPast(data.past);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []))
      .catch(() => {});
  }, [load]);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 4000);
  }

  const handleSelect = useCallback((r: ReservationDTO, additive: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (additive) {
        if (next.has(r.id)) next.delete(r.id);
        else next.add(r.id);
        return next;
      }
      if (prev.size === 1 && prev.has(r.id)) return new Set();
      return new Set([r.id]);
    });
  }, []);

  // Delete = 선택 일괄 취소 / Esc = 해제 (지난 예약은 취소 불가 — 제외)
  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        return;
      }
      if (e.key !== "Delete" || selectedIds.size === 0 || editing) return;
      const all = [...(upcoming ?? []), ...past];
      const targets = all.filter((r) => selectedIds.has(r.id));
      const today = kstTodayStr();
      const deletable = targets.filter((r) => r.date >= today);
      const skippedPast = targets.length - deletable.length;
      if (deletable.length === 0) {
        showToast("지난 예약은 취소할 수 없습니다.");
        return;
      }
      let msg = `선택한 ${deletable.length}건의 예약을 취소하시겠습니까?`;
      if (skippedPast > 0) msg += `\n(지난 예약 ${skippedPast}건은 제외됩니다)`;
      if (deletable.some((r) => r.isRecurring)) msg += `\n반복 예약은 선택한 일정만 취소됩니다.`;
      if (!confirm(msg)) return;
      const results = await Promise.all(
        deletable.map((r) =>
          fetch(`/api/reservations/${r.id}?scope=one`, { method: "DELETE" })
            .then((res) => res.ok)
            .catch(() => false)
        )
      );
      const ok = results.filter(Boolean).length;
      setSelectedIds(new Set());
      load();
      showToast(
        ok === results.length ? `${ok}건의 예약이 취소되었습니다.` : `${ok}건 취소, ${results.length - ok}건 실패했습니다.`
      );
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, upcoming, past, editing, load]);

  const listProps = {
    meId: me.id,
    selectedIds,
    onSelect: handleSelect,
    onEdit: (r: ReservationDTO) => setEditing(r),
    onGoto: (r: ReservationDTO) => router.push(`/?date=${r.date}&focus=${r.id}`),
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <h1 className="text-lg font-bold mb-4">내 예약</h1>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1 w-fit">
        {(
          [
            ["upcoming", `다가오는 예약${upcoming ? ` (${upcoming.length})` : ""}`],
            ["past", "지난 예약"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setTab(key);
              setSelectedIds(new Set());
            }}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors cursor-pointer",
              tab === key ? "bg-card text-accent shadow-sm" : "text-gray-500"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {upcoming === null ? (
        <div className="flex justify-center py-16 text-gray-400">
          <Spinner className="h-6 w-6" />
        </div>
      ) : tab === "upcoming" ? (
        <ReservationList
          items={upcoming}
          {...listProps}
          emptyText="다가오는 예약이 없습니다. 예약 현황에서 회의실을 예약해보세요."
        />
      ) : (
        <ReservationList
          items={past}
          {...listProps}
          dimWhen={() => true}
          emptyText="지난 예약이 없습니다."
        />
      )}

      {editing && (
        <ReservationModal
          state={{ mode: "edit", reservation: editing }}
          rooms={rooms}
          me={me}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            load();
            showToast(message ?? "예약이 저장되었습니다.");
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-full px-4 py-2 text-sm font-medium text-white bg-neutral-900/90 shadow-lg animate-fade-in-up">
          {toast}
        </div>
      )}
    </main>
  );
}
