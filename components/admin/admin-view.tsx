"use client";

// 관리자모드 — 회의실/공휴일/회원/감사 로그 관리.

import { useState } from "react";
import { cn } from "@/components/ui";
import { RoomsAdmin } from "@/components/admin/rooms-admin";
import { HolidaysAdmin } from "@/components/admin/holidays-admin";
import { UsersAdmin } from "@/components/admin/users-admin";
import { AuditAdmin } from "@/components/admin/audit-admin";
import { NoticesAdmin } from "@/components/admin/notices-admin";

const TABS = [
  { key: "rooms", label: "회의실" },
  { key: "notices", label: "공지" },
  { key: "holidays", label: "공휴일" },
  { key: "users", label: "회원" },
  { key: "audit", label: "감사 로그" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AdminView() {
  const [tab, setTab] = useState<TabKey>("rooms");

  return (
    <main className="mx-auto max-w-4xl px-4 py-5">
      <h1 className="text-lg font-bold mb-4">관리자</h1>
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors cursor-pointer",
              tab === t.key ? "bg-card text-accent shadow-sm" : "text-gray-500"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "rooms" && <RoomsAdmin />}
      {tab === "notices" && <NoticesAdmin />}
      {tab === "holidays" && <HolidaysAdmin />}
      {tab === "users" && <UsersAdmin />}
      {tab === "audit" && <AuditAdmin />}
    </main>
  );
}
