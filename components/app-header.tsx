"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/components/ui";
import { useTheme } from "@/components/theme";
import { CalendarDays, Search, User, Shield, LogOut, Sun, Moon } from "lucide-react";

type Props = {
  userName: string;
  isAdmin: boolean;
};

const NAV = [
  { href: "/", label: "예약 현황", icon: CalendarDays },
  { href: "/my", label: "내 예약", icon: User },
  { href: "/search", label: "검색", icon: Search },
];

export function AppHeader({ userName, isAdmin }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { dark, toggle } = useTheme();

  const nav = isAdmin ? [...NAV, { href: "/admin", label: "관리자", icon: Shield }] : NAV;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      {/* 상단 헤더 */}
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur border-b border-line">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-6 min-w-0">
            <Link href="/" className="text-lg font-extrabold tracking-tight text-accent shrink-0">
              DW meeting
            </Link>
            {/* 데스크톱 내비게이션 */}
            <nav className="hidden sm:flex items-center gap-1">
              {nav.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent-soft text-accent"
                        : "text-muted hover:text-foreground hover:bg-gray-100"
                    )}
                  >
                    <Icon size={15} strokeWidth={2.2} />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggle}
              className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-gray-100 transition-colors cursor-pointer"
              title={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
              aria-label="테마 전환"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <span className="text-[13px] text-gray-600 max-w-[120px] truncate">
              <b className="font-semibold text-foreground">{userName}</b>님
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-1 text-[13px] text-muted hover:text-foreground rounded-lg px-2 py-1.5 hover:bg-gray-100 transition-colors cursor-pointer"
              title="로그아웃"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      {/* 모바일 하단 내비게이션 */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-accent" : "text-gray-400"
                )}
              >
                <Icon size={19} strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
