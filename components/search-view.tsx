"use client";

// 예약 검색 — 예약자 이름, 목적, 회의실 번호로 검색. 결과에 날짜+요일 표기.
// 클릭=선택, 더블클릭=수정, 이동 아이콘=예약 현황에서 보기. 지난 예약은 흐리게.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Spinner } from "@/components/ui";
import { ReservationList } from "@/components/reservation-list";
import { ReservationModal } from "@/components/board/reservation-modal";
import type { Me, ReservationDTO, Room } from "@/components/board/types";
import { kstTodayStr } from "@/lib/time";
import { Search, X } from "lucide-react";

const SEARCH_KEY = "meeting.search.q";

export function SearchView({ me }: { me: Me }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ReservationDTO[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReservationDTO | null>(null);
  const [toast, setToast] = useState("");

  const today = kstTodayStr();

  useEffect(() => {
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []))
      .catch(() => {});
    // 예약 현황에 다녀와도 검색 상태 유지: 저장된 검색어로 자동 재검색 (결과는 최신)
    const saved = sessionStorage.getItem(SEARCH_KEY);
    if (saved) {
      setQ(saved);
      runSearch(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(query: string) {
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    sessionStorage.setItem(SEARCH_KEY, query);
    runSearch(query);
  }

  function clearSearch() {
    setQ("");
    setResults(null);
    setSelectedId(null);
    sessionStorage.removeItem(SEARCH_KEY);
    inputRef.current?.focus();
  }

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 4000);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <h1 className="text-lg font-bold mb-4">예약 검색</h1>
      <form onSubmit={onSubmit} className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            placeholder="예약자 이름, 예약 목적, 회의실 번호로 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            className="pr-9"
          />
          {q && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer"
              aria-label="검색어 지우기"
            >
              <X size={15} />
            </button>
          )}
        </div>
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
            selectedId={selectedId}
            onSelect={(r) => setSelectedId((prev) => (prev === r.id ? null : r.id))}
            onEdit={(r) => setEditing(r)}
            onGoto={(r) => router.push(`/?date=${r.date}&focus=${r.id}`)}
            dimWhen={(r) => r.date < today}
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
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[60] rounded-full px-4 py-2 text-sm font-medium text-white bg-neutral-900/90 shadow-lg animate-fade-in-up">
          {toast}
        </div>
      )}
    </main>
  );
}
