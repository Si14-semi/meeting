import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, isResponse, jsonError } from "@/lib/api";
import { kstTodayStr, isValidDateStr } from "@/lib/time";
import {
  validateSlotShape,
  validateNotPast,
  findConflicts,
  isOverlapError,
  createReservation,
  type SlotInput,
} from "@/lib/reservations";
import { expandRule } from "@/lib/recurrence";
import type { CurrentUser } from "@/lib/auth";

type Scope = "one" | "following" | "all";

const recurrenceSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  interval: z.number().int().min(1).max(99).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  monthlyMode: z.enum(["DAY_OF_MONTH", "NTH_WEEKDAY"]).nullable().default(null),
  endDate: z.string().nullable().default(null),
  count: z.number().int().min(1).max(400).nullable().default(null),
});

const patchSchema = z.object({
  roomId: z.number().int().optional(),
  date: z.string().optional(),
  startMin: z.number().int().optional(),
  endMin: z.number().int().optional(),
  purpose: z.string().trim().max(100).optional(),
  scope: z.enum(["one", "following", "all"]).default("one"),
  onlyAvailable: z.boolean().default(false),
  // undefined = 반복 규칙 유지 / null = 반복 해제 / 객체 = 새 규칙 적용
  recurrence: recurrenceSchema.nullable().optional(),
});

async function loadTarget(id: string, user: CurrentUser) {
  const r = await prisma.reservation.findUnique({
    where: { id },
    include: { series: true, user: { select: { id: true, name: true } }, room: { select: { number: true } } },
  });
  if (!r) return { error: jsonError(404, "예약을 찾을 수 없습니다.") };
  if (r.userId !== user.id && user.role !== "ADMIN") {
    return { error: jsonError(403, "본인의 예약만 수정·취소할 수 있습니다.") };
  }
  if (r.date < kstTodayStr()) {
    return { error: jsonError(400, "지난 예약은 변경할 수 없습니다.") };
  }
  return { reservation: r };
}

async function logIfAdminForced(
  user: CurrentUser,
  action: "FORCE_UPDATE" | "FORCE_CANCEL",
  target: { id: string; userId: string; date: string; startMin: number; endMin: number; purpose: string; room: { number: string }; user: { name: string } },
  extra?: Record<string, unknown>
) {
  if (user.role !== "ADMIN" || target.userId === user.id) return;
  await prisma.auditLog.create({
    data: {
      adminId: user.id,
      action,
      detail: {
        reservationId: target.id,
        ownerName: target.user.name,
        room: target.room.number,
        date: target.date,
        startMin: target.startMin,
        endMin: target.endMin,
        purpose: target.purpose,
        ...extra,
      },
    },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "입력값이 올바르지 않습니다.");
  const p = parsed.data;

  const loaded = await loadTarget(id, user);
  if ("error" in loaded) return loaded.error;
  const r = loaded.reservation;

  const newRoomId = p.roomId ?? r.roomId;
  const newDate = p.date ?? r.date;
  const newStart = p.startMin ?? r.startMin;
  const newEnd = p.endMin ?? r.endMin;
  const newPurpose = p.purpose ?? r.purpose;

  if (p.date !== undefined && !isValidDateStr(newDate)) return jsonError(400, "날짜가 올바르지 않습니다.");

  const room = await prisma.room.findUnique({ where: { id: newRoomId } });
  if (!room || !room.active) return jsonError(404, "회의실을 찾을 수 없습니다.");

  const today = kstTodayStr();

  // ---------- 케이스 1: 반복 규칙 변경 (또는 단건→반복 전환) ----------
  if (p.recurrence !== undefined && p.recurrence !== null) {
    // 대상 범위의 기존 인스턴스를 삭제하고 새 규칙으로 다시 생성한다.
    const shapeError = validateSlotShape({ startMin: newStart, endMin: newEnd, date: newDate }) ?? validateNotPast(newDate);
    if (shapeError) return jsonError(400, shapeError);
    if (p.recurrence.endDate && !isValidDateStr(p.recurrence.endDate)) return jsonError(400, "반복 종료일이 올바르지 않습니다.");

    const deleteWhere =
      r.seriesId === null || p.scope === "one"
        ? { id: r.id }
        : {
            seriesId: r.seriesId,
            date: { gte: p.scope === "following" ? (r.date > today ? r.date : today) : today },
          };
    const oldRows = await prisma.reservation.findMany({ where: deleteWhere, select: { id: true } });
    const oldIds = oldRows.map((row) => row.id);

    // 삭제 전에 새 규칙의 충돌을 먼저 확인한다 (기존 자기 예약은 제외).
    // 충돌이 있는데 사용자가 아직 확인하지 않았다면 아무것도 삭제하지 않고 되묻는다.
    const rule = { ...p.recurrence, startDate: newDate };
    const newDates = expandRule(rule);
    if (newDates.length === 0) return jsonError(400, "반복 조건에 해당하는 날짜가 없습니다.");
    const preConflicts = await findConflicts(
      newDates.map((d) => ({ roomId: newRoomId, date: d, startMin: newStart, endMin: newEnd })),
      oldIds
    );
    const conflictDates = new Set(preConflicts.map((c) => c.date));
    const preAvailable = newDates.filter((d) => !conflictDates.has(d));
    if (preConflicts.length > 0 && !p.onlyAvailable) {
      return NextResponse.json(
        {
          error: preAvailable.length > 0 ? "일부 날짜에 이미 예약이 있습니다." : "모든 날짜가 이미 예약되어 있어 변경할 수 없습니다.",
          conflicts: preConflicts,
          availableDates: preAvailable,
        },
        { status: 409 }
      );
    }
    if (preAvailable.length === 0) {
      return NextResponse.json(
        { error: "모든 날짜가 이미 예약되어 있어 변경할 수 없습니다.", conflicts: preConflicts, availableDates: [] },
        { status: 409 }
      );
    }

    await prisma.reservation.deleteMany({ where: { id: { in: oldIds } } });
    const result = await createReservation({
      userId: r.userId,
      roomId: newRoomId,
      date: newDate,
      startMin: newStart,
      endMin: newEnd,
      purpose: newPurpose,
      recurrence: rule,
      onlyAvailable: true, // 위에서 이미 확인받았으므로 가능한 날짜만 생성
    });

    if (!result.ok) {
      // 사전 확인과 생성 사이의 경합으로 전부 겹친 극히 드문 경우
      return NextResponse.json(
        { error: result.error, conflicts: result.conflicts, note: "기존 반복 예약은 해제되었습니다. 다시 예약해주세요." },
        { status: result.status }
      );
    }
    await logIfAdminForced(user, "FORCE_UPDATE", r, { changedTo: { roomId: newRoomId, date: newDate, startMin: newStart, endMin: newEnd, recurrenceChanged: true } });
    return NextResponse.json({ ok: true, createdCount: result.createdCount, skippedDates: result.skippedDates });
  }

  // ---------- 케이스 2: 반복 해제 (recurrence === null, 시리즈 인스턴스에서) ----------
  if (p.recurrence === null && r.seriesId !== null && p.scope !== "one") {
    // 이 일정만 남기고 범위 내 나머지 삭제
    const boundary = p.scope === "following" ? (r.date > today ? r.date : today) : today;
    await prisma.reservation.deleteMany({
      where: { seriesId: r.seriesId, date: { gte: boundary }, id: { not: r.id } },
    });
    await prisma.reservation.update({ where: { id: r.id }, data: { seriesId: null } });
    // 계속해서 시간/장소 변경도 있으면 아래 단건 수정 로직으로 이어감
  }

  // ---------- 케이스 3: 단건 수정 (scope=one, 비반복, 또는 방금 반복 해제된 예약) ----------
  if (p.scope === "one" || r.seriesId === null || p.recurrence === null) {
    const shapeError = validateSlotShape({ startMin: newStart, endMin: newEnd, date: newDate }) ?? validateNotPast(newDate);
    if (shapeError) return jsonError(400, shapeError);

    const timeChanged = newRoomId !== r.roomId || newDate !== r.date || newStart !== r.startMin || newEnd !== r.endMin;
    if (timeChanged) {
      const conflicts = await findConflicts([{ roomId: newRoomId, date: newDate, startMin: newStart, endMin: newEnd }], [r.id]);
      if (conflicts.length > 0) {
        return NextResponse.json(
          { error: "이미 예약된 시간과 겹쳐 변경할 수 없습니다.", conflicts },
          { status: 409 }
        );
      }
    }
    try {
      await prisma.reservation.update({
        where: { id: r.id },
        data: { roomId: newRoomId, date: newDate, startMin: newStart, endMin: newEnd, purpose: newPurpose },
      });
    } catch (e) {
      if (isOverlapError(e)) {
        const conflicts = await findConflicts([{ roomId: newRoomId, date: newDate, startMin: newStart, endMin: newEnd }], [r.id]);
        return NextResponse.json({ error: "이미 예약된 시간과 겹쳐 변경할 수 없습니다.", conflicts }, { status: 409 });
      }
      throw e;
    }
    await logIfAdminForced(user, "FORCE_UPDATE", r, { changedTo: { roomId: newRoomId, date: newDate, startMin: newStart, endMin: newEnd } });
    return NextResponse.json({ ok: true, createdCount: 1, skippedDates: [] });
  }

  // ---------- 케이스 4: 시리즈 범위 수정 (시간/회의실/목적, 규칙 유지) ----------
  // 날짜 이동(p.date)은 개별 일정에서만 의미가 있으므로 시리즈 수정에서는 무시한다.
  const shapeError = validateSlotShape({ startMin: newStart, endMin: newEnd, date: r.date });
  if (shapeError) return jsonError(400, shapeError);

  const boundary = p.scope === "following" ? (r.date > today ? r.date : today) : today;
  const targets = await prisma.reservation.findMany({
    where: { seriesId: r.seriesId, date: { gte: boundary } },
    orderBy: { date: "asc" },
  });
  if (targets.length === 0) return jsonError(400, "변경할 예약이 없습니다.");

  const timeChanged = newRoomId !== r.roomId || newStart !== r.startMin || newEnd !== r.endMin;
  if (!timeChanged) {
    // 목적만 변경
    await prisma.reservation.updateMany({
      where: { id: { in: targets.map((t) => t.id) } },
      data: { purpose: newPurpose },
    });
    await logIfAdminForced(user, "FORCE_UPDATE", r, { scope: p.scope, purposeOnly: true });
    return NextResponse.json({ ok: true, createdCount: targets.length, skippedDates: [] });
  }

  const slots: SlotInput[] = targets.map((t) => ({ roomId: newRoomId, date: t.date, startMin: newStart, endMin: newEnd }));
  const excludeIds = targets.map((t) => t.id);

  for (let attempt = 0; attempt < 3; attempt++) {
    const conflicts = await findConflicts(slots, excludeIds);
    const conflictDates = new Set(conflicts.map((c) => c.date));
    const available = targets.filter((t) => !conflictDates.has(t.date));

    if (conflicts.length > 0 && !p.onlyAvailable) {
      return NextResponse.json(
        {
          error: "일부 날짜가 이미 예약된 시간과 겹칩니다.",
          conflicts,
          availableDates: available.map((t) => t.date),
        },
        { status: 409 }
      );
    }
    if (available.length === 0) {
      return NextResponse.json({ error: "모든 날짜가 겹쳐 변경할 수 없습니다.", conflicts }, { status: 409 });
    }
    try {
      await prisma.reservation.updateMany({
        where: { id: { in: available.map((t) => t.id) } },
        data: { roomId: newRoomId, startMin: newStart, endMin: newEnd, purpose: newPurpose },
      });
      await logIfAdminForced(user, "FORCE_UPDATE", r, {
        scope: p.scope,
        changedTo: { roomId: newRoomId, startMin: newStart, endMin: newEnd },
        updatedCount: available.length,
      });
      return NextResponse.json({
        ok: true,
        createdCount: available.length,
        skippedDates: targets.filter((t) => conflictDates.has(t.date)).map((t) => t.date),
      });
    } catch (e) {
      if (isOverlapError(e)) continue;
      throw e;
    }
  }
  return jsonError(409, "예약 경합이 발생했습니다. 잠시 후 다시 시도해주세요.");
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  const scope = (req.nextUrl.searchParams.get("scope") ?? "one") as Scope;

  const loaded = await loadTarget(id, user);
  if ("error" in loaded) return loaded.error;
  const r = loaded.reservation;

  const today = kstTodayStr();
  let deletedCount: number;

  if (r.seriesId === null || scope === "one") {
    await prisma.reservation.delete({ where: { id: r.id } });
    deletedCount = 1;
  } else {
    const boundary = scope === "following" ? (r.date > today ? r.date : today) : today;
    const res = await prisma.reservation.deleteMany({
      where: { seriesId: r.seriesId, date: { gte: boundary } },
    });
    deletedCount = res.count;
    // 시리즈에 남은 인스턴스가 없으면 시리즈도 정리
    const remaining = await prisma.reservation.count({ where: { seriesId: r.seriesId } });
    if (remaining === 0) {
      await prisma.recurringSeries.delete({ where: { id: r.seriesId } }).catch(() => {});
    }
  }

  await logIfAdminForced(user, "FORCE_CANCEL", r, { scope, deletedCount });
  return NextResponse.json({ ok: true, deletedCount });
}
