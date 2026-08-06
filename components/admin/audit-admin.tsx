"use client";

// 감사 로그 — 관리자 행위 이력 (강제 취소/수정, 비밀번호 리셋, 회원/회의실 변경)

import { useEffect, useState } from "react";
import { minToLabel, formatDateWithWeekday } from "@/lib/time";

type Log = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  adminName: string;
  createdAt: string;
};

const ACTION_LABEL: Record<string, { label: string; className: string }> = {
  FORCE_CANCEL: { label: "예약 강제취소", className: "bg-red-50 text-red-700" },
  FORCE_UPDATE: { label: "예약 강제수정", className: "bg-amber-50 text-amber-700" },
  RESET_PASSWORD: { label: "비밀번호 리셋", className: "bg-indigo-50 text-indigo-700" },
  DELETE_USER: { label: "회원 삭제", className: "bg-red-50 text-red-700" },
  ROOM_CREATE: { label: "회의실 추가", className: "bg-emerald-50 text-emerald-700" },
  ROOM_UPDATE: { label: "회의실 수정", className: "bg-gray-100 text-gray-600" },
  ROOM_DELETE: { label: "회의실 삭제", className: "bg-red-50 text-red-700" },
};

function summarize(log: Log): string {
  const d = log.detail as Record<string, unknown> & {
    room?: string;
    date?: string;
    startMin?: number;
    endMin?: number;
    ownerName?: string;
    email?: string;
    name?: string;
    number?: string;
    scope?: string;
  };
  switch (log.action) {
    case "FORCE_CANCEL":
    case "FORCE_UPDATE": {
      const time =
        d.startMin !== undefined && d.endMin !== undefined
          ? ` ${minToLabel(d.startMin)}~${minToLabel(d.endMin)}`
          : "";
      const scope = d.scope && d.scope !== "one" ? ` (${d.scope === "all" ? "모든 일정" : "향후 일정"})` : "";
      return `${d.ownerName ?? "?"}님의 ${d.room ?? "?"}호 ${d.date ? formatDateWithWeekday(d.date) : ""}${time} 예약${scope}`;
    }
    case "RESET_PASSWORD":
    case "DELETE_USER":
      return `${d.name ?? ""} (${d.email ?? ""})`;
    case "ROOM_CREATE":
    case "ROOM_DELETE":
      return `${d.number ?? "?"}호`;
    case "ROOM_UPDATE":
      return `회의실 ID ${(d as { roomId?: number }).roomId}`;
    default:
      return JSON.stringify(log.detail);
  }
}

export function AuditAdmin() {
  const [logs, setLogs] = useState<Log[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/audit")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []))
      .catch(() => setLogs([]));
  }, []);

  if (logs === null) return <p className="text-sm text-gray-400 text-center py-10">불러오는 중...</p>;

  return (
    <div className="bg-card rounded-xl border border-line divide-y divide-line">
      {logs.map((log) => {
        const meta = ACTION_LABEL[log.action] ?? { label: log.action, className: "bg-gray-100 text-gray-600" };
        const dt = new Date(log.createdAt);
        const stamp = dt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
        return (
          <div key={log.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="text-[12px] text-gray-400 w-24 shrink-0">{stamp}</span>
            <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${meta.className}`}>
              {meta.label}
            </span>
            <span className="text-gray-700 truncate flex-1">{summarize(log)}</span>
            <span className="text-[12px] text-gray-400 shrink-0">{log.adminName}</span>
          </div>
        );
      })}
      {logs.length === 0 && <p className="text-sm text-gray-400 text-center py-8">기록이 없습니다.</p>}
    </div>
  );
}
