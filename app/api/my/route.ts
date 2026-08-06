import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, isResponse } from "@/lib/api";
import { kstTodayStr } from "@/lib/time";
import { reservationInclude, serializeReservation } from "@/lib/reservations";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const today = kstTodayStr();
  const [upcoming, past] = await Promise.all([
    prisma.reservation.findMany({
      where: { userId: user.id, date: { gte: today } },
      include: reservationInclude,
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
    }),
    prisma.reservation.findMany({
      where: { userId: user.id, date: { lt: today } },
      include: reservationInclude,
      orderBy: [{ date: "desc" }, { startMin: "asc" }],
      take: 100,
    }),
  ]);

  return NextResponse.json({
    upcoming: upcoming.map(serializeReservation),
    past: past.map(serializeReservation),
  });
}
