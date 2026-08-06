"use client";

// 공지 관리 — 작성/수정/활성 토글/삭제. 활성 공지는 최대 2개 (서버에서도 강제).

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, cn } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";

type Notice = {
  id: string;
  title: string;
  content: string;
  active: boolean;
  createdAt: string;
};

export function NoticesAdmin() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/notices");
    if (res.ok) setNotices((await res.json()).notices);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = notices.filter((n) => n.active).length;

  async function add() {
    setError("");
    if (!newTitle.trim() || !newContent.trim()) {
      setError("제목과 내용을 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim() }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "등록에 실패했습니다.");
        return;
      }
      setNewTitle("");
      setNewContent("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, data: Partial<Notice>) {
    setError("");
    const res = await fetch(`/api/admin/notices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) setError((await res.json()).error ?? "저장에 실패했습니다.");
    load();
  }

  async function remove(notice: Notice) {
    if (!confirm(`공지 "${notice.title}"를 삭제하시겠습니까?`)) return;
    await fetch(`/api/admin/notices/${notice.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}

      <div className="bg-card rounded-xl border border-line p-4">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[13px] font-semibold text-gray-600">공지 작성</p>
          <span className={cn("text-[12px]", activeCount >= 2 ? "text-danger font-medium" : "text-gray-400")}>
            활성 공지 {activeCount}/2
          </span>
        </div>
        <div className="space-y-2">
          <Input
            placeholder="제목"
            value={newTitle}
            maxLength={100}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            placeholder="내용 (여러 줄 가능)"
            value={newContent}
            maxLength={2000}
            rows={3}
            onChange={(e) => setNewContent(e.target.value)}
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
          <div className="flex justify-end">
            <Button onClick={add} disabled={busy || activeCount >= 2}>
              <Plus size={15} /> 등록
            </Button>
          </div>
          {activeCount >= 2 && (
            <p className="text-[12px] text-gray-400">
              활성 공지가 2개입니다. 새 공지를 등록하려면 기존 공지를 먼저 비활성화하세요.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {notices.map((n) => (
          <NoticeRow key={n.id} notice={n} onPatch={patch} onDelete={() => remove(n)} />
        ))}
        {notices.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">등록된 공지가 없습니다.</p>
        )}
      </div>
      <p className="text-[12px] text-gray-400">
        공지를 수정하면 &quot;다시 보지 않기&quot;를 눌렀던 사용자에게도 다시 표시됩니다.
      </p>
    </div>
  );
}

function NoticeRow({
  notice,
  onPatch,
  onDelete,
}: {
  notice: Notice;
  onPatch: (id: string, data: Partial<Notice>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(notice.title);
  const [content, setContent] = useState(notice.content);
  const dirty = title !== notice.title || content !== notice.content;

  return (
    <div className={cn("bg-card rounded-xl border p-4", notice.active ? "border-accent/40" : "border-line opacity-70")}>
      <div className="flex items-center gap-2 mb-2">
        <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className="h-9 flex-1" />
        <span className="text-[12px] text-gray-400 shrink-0">{notice.createdAt}</span>
        <button
          onClick={() => onPatch(notice.id, { active: !notice.active })}
          className={cn(
            "text-[12px] font-medium rounded-full px-2.5 py-1 cursor-pointer transition-colors shrink-0",
            notice.active
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          )}
        >
          {notice.active ? "게시중" : "비활성"}
        </button>
        <button onClick={onDelete} className="text-gray-400 hover:text-danger p-1.5 cursor-pointer shrink-0" aria-label="삭제">
          <Trash2 size={15} />
        </button>
      </div>
      <textarea
        value={content}
        maxLength={2000}
        rows={2}
        onChange={(e) => setContent(e.target.value)}
        className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
      />
      {dirty && (
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={() => onPatch(notice.id, { title: title.trim(), content: content.trim() })}>
            저장
          </Button>
        </div>
      )}
    </div>
  );
}
