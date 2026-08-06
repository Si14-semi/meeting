"use client";

// 공용 UI 프리미티브 — 프로젝트 전반에서 동일한 룩앤필을 유지한다.

import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* ---------- Button ---------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-indigo-700 disabled:bg-indigo-300 shadow-sm",
  secondary:
    "bg-card text-foreground border border-line hover:bg-gray-50 disabled:text-gray-400",
  ghost: "text-muted hover:bg-gray-100 hover:text-foreground",
  danger: "bg-danger text-white hover:bg-red-700 disabled:bg-red-300 shadow-sm",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: "sm" | "md";
  }
>(function Button({ variant = "primary", size = "md", className, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors cursor-pointer disabled:cursor-not-allowed",
        size === "md" ? "h-10 px-4 text-sm" : "h-8 px-3 text-[13px]",
        buttonStyles[variant],
        className
      )}
      {...props}
    />
  );
});

/* ---------- Input ---------- */

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-foreground placeholder:text-gray-400",
        "focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow",
        className
      )}
      {...props}
    />
  );
});

export function Label({
  children,
  htmlFor,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("block text-[13px] font-medium text-gray-600 mb-1.5", className)}>
      {children}
    </label>
  );
}

/* ---------- Select ---------- */

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-line bg-card px-2.5 text-sm text-foreground",
        "focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-shadow cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});

/* ---------- Checkbox ---------- */

export function Checkbox({
  label,
  checked,
  onChange,
  className,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex items-center gap-2 cursor-pointer select-none", className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-line-strong text-accent accent-[var(--accent)] cursor-pointer"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

/* ---------- Modal ---------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
  closeOnBackdrop = true,
  draggable = false,
  lightBackdrop = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
  /** 바깥(배경) 클릭으로 닫기 — 예약창은 false (실수 방지) */
  closeOnBackdrop?: boolean;
  /** 제목줄을 잡고 창 이동 (데스크톱 마우스 전용) */
  draggable?: boolean;
  /** 배경 어둡기를 낮춰 뒤 화면이 잘 보이게 */
  lightBackdrop?: boolean;
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    function onMove(e: PointerEvent) {
      const s = dragStart.current;
      if (!s) return;
      setPos({ x: s.x + e.clientX - s.px, y: s.y + e.clientY - s.py });
    }
    function onUp() {
      dragStart.current = null;
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fade-in p-0 sm:p-4",
        lightBackdrop ? "bg-black/15" : "bg-black/40"
      )}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full bg-card shadow-xl animate-fade-in-up",
          "rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-y-auto thin-scroll",
          maxWidth
        )}
        style={pos.x !== 0 || pos.y !== 0 ? { transform: `translate(${pos.x}px, ${pos.y}px)` } : undefined}
      >
        {title !== undefined && (
          <div
            className={cn(
              "flex items-center justify-between px-5 pt-4 pb-1",
              draggable && "sm:cursor-move select-none"
            )}
            onPointerDown={(e) => {
              if (!draggable || e.pointerType !== "mouse" || e.button !== 0) return;
              if ((e.target as HTMLElement).closest("button")) return;
              dragStart.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
              e.preventDefault();
            }}
          >
            <h2 className="text-base font-semibold">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 cursor-pointer p-1 -mr-1"
              aria-label="닫기"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-5 pb-5 pt-2">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Spinner ---------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin h-4 w-4", className)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/* ---------- Alert (inline error/info) ---------- */

export function Alert({
  kind = "error",
  children,
}: {
  kind?: "error" | "info" | "warn";
  children: ReactNode;
}) {
  const styles = {
    error: "bg-red-50 text-red-700 border-red-200",
    info: "bg-indigo-50 text-indigo-700 border-indigo-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
  }[kind];
  return (
    <div className={cn("rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed", styles)}>
      {children}
    </div>
  );
}
