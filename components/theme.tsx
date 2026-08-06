"use client";

// 라이트/다크 테마 — html.dark 클래스 + localStorage 유지.
// 첫 페인트 전 적용(깜빡임 방지)은 app/layout.tsx의 인라인 스크립트가 담당.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const THEME_KEY = "meeting.theme";

const ThemeCtx = createContext<{ dark: boolean; toggle: () => void }>({
  dark: false,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return <ThemeCtx.Provider value={{ dark, toggle }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
