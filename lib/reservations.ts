// 예약 도메인 로직 — 정책 검증, 충돌 조회, 생성(단건/반복).
// 겹침의 최종 방어선은 DB exclusion constraint(reservations_no_overlap)이며,
// 여기서는 사용자 안내를 위해 사전 조회를 하고, 경합 시 제약 에러를 잡아 재시도한다.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { OPEN_MIN, CLOSE_MIN, SLOT_MIN, kstTodayStr, isValidDateStr, minToLabel, formatDateWithWeekday } from "@/lib/time";
import { expandRule, type RecurrenceRule } from "@/lib/recurrence";

export type SlotInput = {
  roomId: number;
  date: string;
  startMin: number;
  endMin: number;
};

export type ConflictInfo = {
  date: string;
  items: {
    id: string;
    startMin: number;
    endMin: number;
    userName: string;
    purpose: string;
  }[];
};

/** 시간대 형식 검증. 문제 있으면 에러 메시지, 없으면 null */
export function validateSlotShape(s: { startMin: number; endMin: number; date: string }): string | null {
  if (!isValidDateStr(s.date)) return "날짜 형식이 올바르지 않습니다.";
  if (!Number.isInteger(s.startMin) || !Number.isInteger(s.endMin)) return "시간이 올바르지 않습니다.";
  if (s.startMin % SLOT_MIN !== 0 || s.endMin % SLOT_MIN !== 0) return "시간은 15분 단위로 선택해주세요.";
  if (s.startMin < OPEN_MIN || s.endMin > CLOSE_MIN) return `예약은 ${minToLabel(OPEN_MIN)}~${minToLabel(CLOSE_MIN)} 사이에서 가능합니다.`;
  if (s.startMin >= s.endMin) return "종료 시간이 시작 시간보다 늦어야 합니다.";
  return null;
}

/** 특정 회의실·날짜·시간대와 겹치는 예약 조회 (excludeIds는 수정 시 자기 자신/자기 시리즈 제외용) */
export async function findConflicts(
  slots: SlotInput[],
  excludeIds: string[] = []
): Promise<ConflictInfo[]> {
  if (slots.length === 0) return [];
  const roomId = slots[0].roomId;
  const dates = [...new Set(slots.map((s) => s.date))];
  const existing = await prisma.reservation.findMany({
    where: { roomId, date: { in: dates }, id: { notIn: excludeIds } },
    include: { user: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { startMin: "asc" }],
  });
  const result: ConflictInfo[] = [];
  for (const slot of slots) {
    const items = existing
      .filter((r) => r.date === slot.date && r.startMin < slot.endMin && r.endMin > slot.startMin)
      .map((r) => ({
        id: r.id,
        startMin: r.startMin,
        endMin: r.endMin,
        userName: r.user.name,
        purpose: r.purpose,
      }));
    if (items.length > 0) result.push({ date: slot.date, items });
  }
  return result;
}

export function isOverlapError(e: unknown): boolean {
  const msg =
    e instanceof Prisma.PrismaClientKnownRequestError
      ? JSON.stringify(e.meta) + e.message
      : e instanceof Error
        ? e.message
        : String(e);
  return msg.includes("reservations_no_overlap") || msg.includes("23P01");
}

export type CreateResult =
  | { ok: true; createdCount: number; seriesId: string | null; skippedDates: string[] }
  | { ok: false; status: number; error: string; conflicts?: ConflictInfo[]; availableDates?: string[] };

/**
 * 예약 생성 (단건 또는 반복).
 * - 반복 + 일부 충돌 시: onlyAvailable=false면 충돌/가능 날짜 목록과 함께 409 반환 →
 *   클라이언트가 "가능한 날짜만 예약하시겠습니까?" 확인 후 onlyAvailable=true로 재요청.
 */
export async function createReservation(params: {
  userId: string;
  roomId: number;
  date: string;
  startMin: number;
  endMin: number;
  purpose: string;
  recurrence: RecurrenceRule | null;
  onlyAvailable: boolean;
}): Promise<CreateResult> {
  const { userId, roomId, startMin, endMin, purpose } = params;

  // 과거 날짜 생성/변경 허용 (사용자 확정: 유연성 우선 — 이력 보정 용도 포함)
  const shapeError = validateSlotShape({ startMin, endMin, date: params.date });
  if (shapeError) return { ok: false, status: 400, error: shapeError };

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || !room.active) return { ok: false, status: 404, error: "회의실을 찾을 수 없습니다." };

  // 전개할 날짜 목록 (단건이면 해당 날짜 하나)
  let dates: string[];
  if (params.recurrence) {
    const rule = { ...params.recurrence, startDate: params.date };
    dates = expandRule(rule);
    if (dates.length === 0) return { ok: false, status: 400, error: "반복 조건에 해당하는 날짜가 없습니다." };
  } else {
    dates = [params.date];
  }
  const slots: SlotInput[] = dates.map((date) => ({ roomId, date, startMin, endMin }));

  // 경합(동시 예약) 시 제약 에러가 나면 최신 상태로 다시 계산해 재시도한다
  for (let attempt = 0; attempt < 3; attempt++) {
    const conflicts = await findConflicts(slots);
    const conflictDates = new Set(conflicts.map((c) => c.date));
    const availableDates = dates.filter((d) => !conflictDates.has(d));

    if (conflicts.length > 0 && !params.onlyAvailable) {
      return {
        ok: false,
        status: 409,
        error:
          dates.length === 1
            ? "이미 예약된 시간과 겹쳐 예약할 수 없습니다."
            : "일부 날짜에 이미 예약이 있습니다.",
        conflicts,
        availableDates,
      };
    }
    if (availableDates.length === 0) {
      return { ok: false, status: 409, error: "모든 날짜가 이미 예약되어 있어 예약할 수 없습니다.", conflicts, availableDates: [] };
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        let seriesId: string | null = null;
        if (params.recurrence && dates.length > 1) {
          const series = await tx.recurringSeries.create({
            data: {
              userId,
              frequency: params.recurrence.frequency,
              interval: params.recurrence.interval,
              weekdays: params.recurrence.weekdays,
              monthlyMode: params.recurrence.monthlyMode,
              startDate: params.date,
              endDate: params.recurrence.endDate,
              count: params.recurrence.count,
            },
          });
          seriesId = series.id;
        }
        await tx.reservation.createMany({
          data: availableDates.map((date) => ({
            roomId,
            userId,
            date,
            startMin,
            endMin,
            purpose,
            seriesId,
          })),
        });
        return { seriesId };
      });
      return {
        ok: true,
        createdCount: availableDates.length,
        seriesId: result.seriesId,
        skippedDates: dates.filter((d) => conflictDates.has(d)),
      };
    } catch (e) {
      if (isOverlapError(e)) continue; // 그 사이 다른 사람이 예약 → 재계산
      throw e;
    }
  }
  return { ok: false, status: 409, error: "예약 경합이 발생했습니다. 잠시 후 다시 시도해주세요." };
}

/** 예약 + 예약자 이름 포함 조회 형태 (그리드/목록 공용) */
export const reservationInclude = {
  user: { select: { id: true, name: true } },
  room: { select: { id: true, number: true, floor: true } },
  series: true,
} satisfies Prisma.ReservationInclude;

export type ReservationWithRefs = Prisma.ReservationGetPayload<{ include: typeof reservationInclude }>;

export function serializeReservation(r: ReservationWithRefs) {
  return {
    id: r.id,
    roomId: r.roomId,
    roomNumber: r.room.number,
    floor: r.room.floor,
    date: r.date,
    dateLabel: formatDateWithWeekday(r.date),
    startMin: r.startMin,
    endMin: r.endMin,
    purpose: r.purpose,
    userId: r.user.id,
    userName: r.user.name,
    seriesId: r.seriesId,
    isRecurring: r.seriesId !== null,
    series: r.series
      ? {
          frequency: r.series.frequency,
          interval: r.series.interval,
          weekdays: r.series.weekdays,
          monthlyMode: r.series.monthlyMode,
          endDate: r.series.endDate,
          count: r.series.count,
        }
      : null,
  };
}
