"use client";

// 회의실 관리 — 추가/번호·층 변경/메타정보(수용인원·자유 정보)/사용중지/삭제
// 자유 정보(description)는 예약 화면에서 호수 hover/클릭 시 표시된다.

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, cn } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";

type AdminRoom = {
  id: number;
  number: string;
  floor: number;
  capacity: number | null;
  description: string | null;
  sortOrder: number;
  active: boolean;
  reservationCount: number;
};

export function RoomsAdmin() {
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [error, setError] = useState("");
  const [newRoom, setNewRoom] = useState({ number: "", floor: "", capacity: "", description: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/rooms");
    if (res.ok) setRooms((await res.json()).rooms);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patchRoom(id: number, data: Partial<AdminRoom>) {
    setError("");
    const res = await fetch(`/api/admin/rooms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) setError((await res.json()).error ?? "저장에 실패했습니다.");
    load();
  }

  async function addRoom() {
    setError("");
    if (!newRoom.number.trim() || !newRoom.floor.trim()) {
      setError("회의실 번호와 층을 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: newRoom.number.trim(),
          floor: parseInt(newRoom.floor),
          capacity: newRoom.capacity ? parseInt(newRoom.capacity) : null,
          description: newRoom.description.trim() || null,
        }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "추가에 실패했습니다.");
        return;
      }
      setNewRoom({ number: "", floor: "", capacity: "", description: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteRoom(room: AdminRoom) {
    const warning =
      room.reservationCount > 0
        ? `${room.number}호를 삭제하면 이 회의실의 예약 ${room.reservationCount}건도 함께 삭제됩니다. 계속하시겠습니까?`
        : `${room.number}호를 삭제하시겠습니까?`;
    if (!confirm(warning)) return;
    await fetch(`/api/admin/rooms/${room.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}

      {/* 추가 폼 */}
      <div className="bg-card rounded-xl border border-line p-4">
        <p className="text-[13px] font-semibold text-gray-600 mb-2.5">회의실 추가</p>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="번호 (예: 141)"
            value={newRoom.number}
            onChange={(e) => setNewRoom({ ...newRoom, number: e.target.value })}
            className="w-28"
          />
          <Input
            placeholder="층"
            type="number"
            value={newRoom.floor}
            onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })}
            className="w-20"
          />
          <Input
            placeholder="수용 인원"
            type="number"
            value={newRoom.capacity}
            onChange={(e) => setNewRoom({ ...newRoom, capacity: e.target.value })}
            className="w-24"
          />
          <Input
            placeholder="회의실 정보 자유 입력 (예: 빔프로젝터, 화이트보드, 화상회의 장비)"
            value={newRoom.description}
            onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
            className="flex-1 min-w-40"
          />
          <Button onClick={addRoom} disabled={busy}>
            <Plus size={15} /> 추가
          </Button>
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-card rounded-xl border border-line divide-y divide-line">
        {rooms.map((room) => (
          <RoomRow key={room.id} room={room} onPatch={patchRoom} onDelete={() => deleteRoom(room)} />
        ))}
        {rooms.length === 0 && <p className="text-sm text-gray-400 text-center py-8">회의실이 없습니다.</p>}
      </div>
      <p className="text-[12px] text-gray-400">
        사용중지된 회의실은 예약 화면에 표시되지 않지만 기존 예약 데이터는 유지됩니다. 삭제는 예약 데이터도 함께 삭제합니다.
      </p>
    </div>
  );
}

function RoomRow({
  room,
  onPatch,
  onDelete,
}: {
  room: AdminRoom;
  onPatch: (id: number, data: Partial<AdminRoom>) => void;
  onDelete: () => void;
}) {
  const [edit, setEdit] = useState({
    number: room.number,
    floor: String(room.floor),
    capacity: room.capacity ? String(room.capacity) : "",
    description: room.description ?? "",
  });
  const dirty =
    edit.number !== room.number ||
    edit.floor !== String(room.floor) ||
    edit.capacity !== (room.capacity ? String(room.capacity) : "") ||
    edit.description !== (room.description ?? "");

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <Input
        value={edit.number}
        onChange={(e) => setEdit({ ...edit, number: e.target.value })}
        className="w-20 h-9"
        aria-label="회의실 번호"
      />
      <Input
        value={edit.floor}
        type="number"
        onChange={(e) => setEdit({ ...edit, floor: e.target.value })}
        className="w-16 h-9"
        aria-label="층"
      />
      <Input
        value={edit.capacity}
        type="number"
        placeholder="인원"
        onChange={(e) => setEdit({ ...edit, capacity: e.target.value })}
        className="w-20 h-9"
        aria-label="수용 인원"
      />
      <textarea
        value={edit.description}
        placeholder="회의실 정보 (자유 입력, 여러 줄 가능)"
        onChange={(e) => setEdit({ ...edit, description: e.target.value })}
        rows={1}
        className="flex-1 min-w-32 rounded-lg border border-line bg-white px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        aria-label="회의실 정보"
      />
      <span className="text-[12px] text-gray-400 w-16 text-right">예약 {room.reservationCount}건</span>
      {dirty && (
        <Button
          size="sm"
          onClick={() =>
            onPatch(room.id, {
              number: edit.number.trim(),
              floor: parseInt(edit.floor) || room.floor,
              capacity: edit.capacity ? parseInt(edit.capacity) : null,
              description: edit.description.trim() || null,
            })
          }
        >
          저장
        </Button>
      )}
      <button
        onClick={() => onPatch(room.id, { active: !room.active })}
        className={cn(
          "text-[12px] font-medium rounded-full px-2.5 py-1 cursor-pointer transition-colors",
          room.active ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
        )}
      >
        {room.active ? "사용중" : "중지됨"}
      </button>
      <button onClick={onDelete} className="text-gray-400 hover:text-danger p-1.5 cursor-pointer" aria-label="삭제">
        <Trash2 size={15} />
      </button>
    </div>
  );
}
