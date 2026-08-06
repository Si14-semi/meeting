import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, isResponse, jsonError } from "@/lib/api";
import { isValidDateStr } from "@/lib/time";
import { createReservation, reservationInclude, serializeReservation } from "@/lib/reservations";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const date = req.nextUrl.searchParams.get("date");
  if (!date || !isValidDateStr(date)) return jsonError(400, "date 파라미터가 필요합니다.");

  const reservations = await prisma.reservation.findMany({
    where: { date },
    include: reservationInclude,
    orderBy: [{ roomId: "asc" }, { startMin: "asc" }],
  });
  return NextResponse.json({ reservations: reservations.map(serializeReservation) });
}

const recurrenceSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  interval: z.number().int().min(1).max(99).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  monthlyMode: z.enum(["DAY_OF_MONTH", "NTH_WEEKDAY"]).nullable().default(null),
  endDate: z.string().nullable().default(null),
  count: z.number().int().min(1).max(400).nullable().default(null),
});

const createSchema = z.object({
  roomId: z.number().int(),
  date: z.string(),
  startMin: z.number().int(),
  endMin: z.number().int(),
  purpose: z.string().trim().max(100).default(""),
  recurrence: recurrenceSchema.nullable().default(null),
  onlyAvailable: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "입력값이 올바르지 않습니다.");
  const p = parsed.data;

  if (p.recurrence?.endDate && !isValidDateStr(p.recurrence.endDate)) {
    return jsonError(400, "반복 종료일이 올바르지 않습니다.");
  }
  if (p.recurrence?.endDate && p.recurrence.endDate < p.date) {
    return jsonError(400, "반복 종료일이 시작일보다 빠릅니다.");
  }

  const result = await createReservation({
    userId: user.id,
    roomId: p.roomId,
    date: p.date,
    startMin: p.startMin,
    endMin: p.endMin,
    purpose: p.purpose,
    recurrence: p.recurrence ? { ...p.recurrence, startDate: p.date } : null,
    onlyAvailable: p.onlyAvailable,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, conflicts: result.conflicts, availableDates: result.availableDates },
      { status: result.status }
    );
  }
  return NextResponse.json({
    ok: true,
    createdCount: result.createdCount,
    skippedDates: result.skippedDates,
  });
}
