"use client";

// 내 예약 모아보기 — 다가오는 예약(가까운 순) + 지난 예약 구분. 여기서도 수정 가능.

import { useCallback, useEffect, useState } from "react";
import { cn, Spinner } from "@/components/ui";
import { ReservationList } from "@/components/reservation-list";
import { ReservationModal } from "@/components/board/reservation-modal";
import type { Me, ReservationDTO, Room } from "@/components/board/types";

export function MyReservations({ me }: { me: Me }) {
  const [upcoming, setUpcoming] = useState<ReservationDTO[] | null>(null);
  const [past, setPast] = useState<ReservationDTO[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
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
            onClick={() => setTab(key)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors cursor-pointer",
              tab === key ? "bg-white text-accent shadow-sm" : "text-gray-500"
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
          onSelect={setEditing}
          emptyText="다가오는 예약이 없습니다. 예약 현황에서 회의실을 예약해보세요."
        />
      ) : (
        <ReservationList items={past} dimmed emptyText="지난 예약이 없습니다." />
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
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-full px-4 py-2 text-sm font-medium text-white bg-gray-900/90 shadow-lg animate-fade-in-up">
          {toast}
        </div>
      )}
    </main>
  );
}
