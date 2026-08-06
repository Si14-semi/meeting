import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "meeting — 회의실 예약",
  description: "Dongwoon Anatech 회의실 예약 시스템",
};

// 핀치줌 허용 (maximumScale 제한 없음) — 그리드 안 더블탭 확대는
// .reservation-grid의 touch-action: manipulation이 막는다 (더블탭=예약창과 충돌 방지)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
