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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ReservationDTO | null>(null);
  const [toast, setToast] = useState("");

  const today = kstTodayStr();

  const handleSelect = (r: ReservationDTO, additive: boolean) => {
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
  };

  // Delete = 선택 일괄 취소 / Esc = 해제 (지난 예약·타인 예약은 제외)
  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        return;
      }
      if (e.key !== "Delete" || selectedIds.size === 0 || editing || !results) return;
      const targets = results.filter((r) => selectedIds.has(r.id));
      const deletable = targets.filter(
        (r) => r.date >= today && (r.userId === me.id || me.role === "ADMIN")
      );
      const skipped = targets.length - deletable.length;
      if (deletable.length === 0) {
        setToast("취소할 수 있는 예약이 없습니다. (지난 예약·타인 예약 제외)");
        window.setTimeout(() => setToast(""), 4000);
        return;
      }
      let msg = `선택한 ${deletable.length}건의 예약을 취소하시겠습니까?`;
      if (skipped > 0) msg += `\n(지난 예약·타인 예약 ${skipped}건은 제외됩니다)`;
      if (deletable.some((r) => r.isRecurring)) msg += `\n반복 예약은 선택한 일정만 취소됩니다.`;
      if (!confirm(msg)) return;
      const rs = await Promise.all(
        deletable.map((r) =>
          fetch(`/api/reservations/${r.id}?scope=one`, { method: "DELETE" })
            .then((res) => res.ok)
            .catch(() => false)
        )
      );
      const ok = rs.filter(Boolean).length;
      setSelectedIds(new Set());
      const q0 = q.trim();
      if (q0) runSearch(q0);
      setToast(ok === rs.length ? `${ok}건의 예약이 취소되었습니다.` : `${ok}건 취소, ${rs.length - ok}건 실패했습니다.`);
      window.setTimeout(() => setToast(""), 4000);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, results, editing, me, q]);

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
    setSelectedIds(new Set());
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
            meId={me.id}
            selectedIds={selectedIds}
            onSelect={handleSelect}
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
