import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, isResponse, jsonError } from "@/lib/api";

const patchSchema = z.object({
  number: z.string().trim().min(1).max(10).optional(),
  floor: z.number().int().min(1).max(200).optional(),
  capacity: z.number().int().min(1).max(500).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const id = parseInt((await ctx.params).id);

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "입력값이 올바르지 않습니다.");

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return jsonError(404, "회의실을 찾을 수 없습니다.");

  if (parsed.data.number && parsed.data.number !== room.number) {
    const dup = await prisma.room.findUnique({ where: { number: parsed.data.number } });
    if (dup) return jsonError(409, "이미 존재하는 회의실 번호입니다.");
  }

  const updated = await prisma.room.update({ where: { id }, data: parsed.data });
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "ROOM_UPDATE",
      detail: { roomId: id, before: { number: room.number, floor: room.floor, active: room.active }, after: parsed.data },
    },
  });
  return NextResponse.json({ ok: true, room: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const id = parseInt((await ctx.params).id);

  const room = await prisma.room.findUnique({
    where: { id },
    include: { _count: { select: { reservations: true } } },
  });
  if (!room) return jsonError(404, "회의실을 찾을 수 없습니다.");

  await prisma.room.delete({ where: { id } }); // 예약도 cascade 삭제
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "ROOM_DELETE",
      detail: { number: room.number, floor: room.floor, deletedReservations: room._count.reservations },
    },
  });
  return NextResponse.json({ ok: true });
}
