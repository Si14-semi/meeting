import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addDays, kstTodayStr } from "@/lib/time";

// 데이터 보관 정책: 최근 1년만 보관, 이전 데이터는 삭제 (사용자 확정 사항).
// Vercel Cron이 매일 호출한다 (vercel.json). CRON_SECRET으로 인증.

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoffDate = addDays(kstTodayStr(), -366);
  const cutoffTime = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);

  const [reservations, auditLogs, series] = await prisma.$transaction([
    prisma.reservation.deleteMany({ where: { date: { lt: cutoffDate } } }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoffTime } } }),
    // 인스턴스가 하나도 남지 않은 반복 시리즈 정리
    prisma.recurringSeries.deleteMany({ where: { reservations: { none: {} } } }),
  ]);

  return NextResponse.json({
    ok: true,
    deleted: {
      reservations: reservations.count,
      auditLogs: auditLogs.count,
      emptySeries: series.count,
    },
  });
}
