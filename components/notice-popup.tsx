"use client";

// 접속 시 공지 팝업 — 활성 공지 최대 2개를 한 팝업에 표시.
// "닫기" = 이번 접속(세션)만 / "다시 보지 않기" = 공지별 영구 숨김 (공지 수정 시 재표시).

import { useEffect, useState } from "react";
import { Button, Modal } from "@/components/ui";
import { Megaphone } from "lucide-react";

type Notice = { id: string; title: string; content: string; updatedAt: string };

const DISMISS_KEY = "meeting.notice.dismissed"; // { [id]: updatedAt }
const SESSION_KEY = "meeting.notice.closed";

function getDismissed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function NoticePopup() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return; // 이번 접속에서 이미 닫음
    fetch("/api/notices")
      .then((r) => r.json())
      .then((d) => {
        const dismissed = getDismissed();
        const visible = (d.notices ?? []).filter(
          (n: Notice) => dismissed[n.id] !== n.updatedAt
        );
        setNotices(visible);
      })
      .catch(() => {});
  }, []);

  if (notices.length === 0) return null;

  function close() {
    sessionStorage.setItem(SESSION_KEY, "1");
    setNotices([]);
  }

  function dismissForever(notice: Notice) {
    const dismissed = getDismissed();
    dismissed[notice.id] = notice.updatedAt;
    localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed));
    setNotices((prev) => {
      const next = prev.filter((n) => n.id !== notice.id);
      if (next.length === 0) sessionStorage.setItem(SESSION_KEY, "1");
      return next;
    });
  }

  return (
    <Modal open onClose={close} title={
      <span className="flex items-center gap-2">
        <Megaphone size={17} className="text-accent" /> 공지사항
      </span>
    }>
      <div className="space-y-3">
        {notices.map((n) => (
          <div key={n.id} className="rounded-xl border border-line bg-gray-50 p-4">
            <p className="text-sm font-bold mb-1.5">{n.title}</p>
            <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-line">{n.content}</p>
            <div className="flex justify-end mt-2">
              <button
                onClick={() => dismissForever(n)}
                className="text-[12px] text-gray-400 hover:text-gray-600 underline underline-offset-2 cursor-pointer"
              >
                다시 보지 않기
              </button>
            </div>
          </div>
        ))}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={close}>
            닫기
          </Button>
        </div>
      </div>
    </Modal>
  );
}
