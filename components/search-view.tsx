"use client";

// 예약 검색 — 예약자 이름, 목적, 회의실 번호로 검색. 결과에 날짜+요일 표기.

import { useEffect, useState, type FormEvent } from "react";
import { Button, Input, Spinner } from "@/components/ui";
import { ReservationList } from "@/components/reservation-list";
import { ReservationModal } from "@/components/board/reservation-modal";
import type { Me, ReservationDTO, Room } from "@/components/board/types";
import { Search } from "lucide-react";

export function SearchView({ me }: { me: Me }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ReservationDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [editing, setEditing] = useState<ReservationDTO | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []))
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (res.ok) setResults(data.results);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 4000);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <h1 className="text-lg font-bold mb-4">예약 검색</h1>
      <form onSubmit={onSubmit} className="flex gap-2 mb-5">
        <Input
          placeholder="예약자 이름, 예약 목적, 회의실 번호로 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <Button type="submit" disabled={loading || !q.trim()} className="shrink-0">
          {loading ? <Spinner /> : <Search size={15} />}
          검색
        </Button>
      </form>

      {results !== null && (
        <>
          <p className="text-[13px] text-gray-500 mb-3">
            검색 결과 <b className="text-foreground">{results.length}</b>건
            {results.length === 200 && " (최대 200건까지 표시)"}
          </p>
          <ReservationList
            items={results}
            onSelect={setEditing}
            emptyText="검색 결과가 없습니다."
          />
        </>
      )}

      {editing && (
        <ReservationModal
          state={{ mode: "edit", reservation: editing }}
          rooms={rooms}
          me={me}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            showToast(message ?? "저장되었습니다.");
            setResults(null);
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
