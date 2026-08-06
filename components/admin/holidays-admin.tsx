"use client";

// 공휴일 관리 — 연도별 목록, 추가/삭제 (음력 명절·임시공휴일은 매년 여기서 갱신)

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { formatDateWithWeekday } from "@/lib/time";
import { Plus, Trash2 } from "lucide-react";

type Holiday = { date: string; name: string };

export function HolidaysAdmin() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/holidays");
    if (res.ok) setHolidays((await res.json()).holidays);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const years = useMemo(() => {
    const ys = new Set(holidays.map((h) => h.date.slice(0, 4)));
    ys.add(String(new Date().getFullYear()));
    return [...ys].sort();
  }, [holidays]);

  const filtered = holidays.filter((h) => h.date.startsWith(year));

  async function add() {
    if (!newDate || !newName.trim()) return;
    await fetch("/api/admin/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: newDate, name: newName.trim() }),
    });
    setNewDate("");
    setNewName("");
    load();
  }

  async function remove(date: string) {
    await fetch(`/api/admin/holidays?date=${date}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-line p-4">
        <p className="text-[13px] font-semibold text-gray-600 mb-2.5">공휴일 추가</p>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-40" />
          <Input
            placeholder="이름 (예: 임시공휴일)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 min-w-40"
          />
          <Button onClick={add} disabled={!newDate || !newName.trim()}>
            <Plus size={15} /> 추가
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-28">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </Select>
        <span className="text-[13px] text-gray-400">{filtered.length}일</span>
      </div>

      <div className="bg-card rounded-xl border border-line divide-y divide-line">
        {filtered.map((h) => (
          <div key={h.date} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-sm font-medium text-red-500 w-36">{formatDateWithWeekday(h.date)}</span>
            <span className="text-sm text-gray-700 flex-1">{h.name}</span>
            <button
              onClick={() => remove(h.date)}
              className="text-gray-400 hover:text-danger p-1.5 cursor-pointer"
              aria-label="삭제"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">{year}년에 등록된 공휴일이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
