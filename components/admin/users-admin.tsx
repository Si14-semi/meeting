"use client";

// 회원 관리 — 목록, 비밀번호 수동 리셋(임시 비밀번호 1회 표시), 삭제

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Modal } from "@/components/ui";
import { KeyRound, Trash2, ShieldCheck } from "lucide-react";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  mustChangePassword: boolean;
  createdAt: string;
  reservationCount: number;
};

export function UsersAdmin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");
  const [tempPw, setTempPw] = useState<{ name: string; email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers((await res.json()).users);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function resetPassword(user: AdminUser) {
    if (!confirm(`${user.name}(${user.email})의 비밀번호를 리셋하시겠습니까?\n임시 비밀번호가 발급되며, 본인이 첫 로그인 시 새 비밀번호를 설정해야 합니다.`)) return;
    setError("");
    const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "리셋에 실패했습니다.");
      return;
    }
    setTempPw({ name: user.name, email: user.email, password: data.tempPassword });
    load();
  }

  async function deleteUser(user: AdminUser) {
    const warning =
      user.reservationCount > 0
        ? `${user.name}(${user.email}) 회원을 삭제하면 예약 ${user.reservationCount}건도 함께 삭제됩니다. 계속하시겠습니까?`
        : `${user.name}(${user.email}) 회원을 삭제하시겠습니까?`;
    if (!confirm(warning)) return;
    setError("");
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json()).error ?? "삭제에 실패했습니다.");
      return;
    }
    load();
  }

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <div className="bg-card rounded-xl border border-line divide-y divide-line">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">{u.name}</span>
                {u.role === "ADMIN" && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-accent bg-accent-soft rounded-full px-1.5 py-0.5">
                    <ShieldCheck size={10} /> 관리자
                  </span>
                )}
                {u.mustChangePassword && (
                  <span className="text-[11px] font-medium text-amber-700 bg-amber-50 rounded-full px-1.5 py-0.5">
                    임시 비밀번호
                  </span>
                )}
              </div>
              <div className="text-[12px] text-gray-400 truncate">
                {u.email} · 가입 {u.createdAt} · 예약 {u.reservationCount}건
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => resetPassword(u)}>
              <KeyRound size={13} /> 비밀번호 리셋
            </Button>
            {u.role !== "ADMIN" && (
              <button
                onClick={() => deleteUser(u)}
                className="text-gray-400 hover:text-danger p-1.5 cursor-pointer"
                aria-label="회원 삭제"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
        {users.length === 0 && <p className="text-sm text-gray-400 text-center py-8">회원이 없습니다.</p>}
      </div>

      {tempPw && (
        <Modal open onClose={() => setTempPw(null)} title="임시 비밀번호 발급됨">
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              <b>{tempPw.name}</b>({tempPw.email})님께 아래 임시 비밀번호를 전달해주세요. 이 창을 닫으면
              다시 확인할 수 없습니다.
            </p>
            <div className="bg-gray-50 border border-line rounded-lg px-4 py-3 text-center">
              <code className="text-lg font-bold tracking-wider select-all">{tempPw.password}</code>
            </div>
            <p className="text-[12px] text-gray-400">본인이 첫 로그인 시 새 비밀번호를 설정하게 됩니다.</p>
            <div className="flex justify-end">
              <Button onClick={() => setTempPw(null)}>확인</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
