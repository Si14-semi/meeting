import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, isResponse, jsonError } from "@/lib/api";

export async function GET() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const rooms = await prisma.room.findMany({
    orderBy: [{ floor: "asc" }, { sortOrder: "asc" }, { number: "asc" }],
    include: { _count: { select: { reservations: true } } },
  });
  return NextResponse.json({
    rooms: rooms.map((r) => ({
      id: r.id,
      number: r.number,
      floor: r.floor,
      capacity: r.capacity,
      description: r.description,
      sortOrder: r.sortOrder,
      active: r.active,
      reservationCount: r._count.reservations,
    })),
  });
}

const createSchema = z.object({
  number: z.string().trim().min(1).max(10),
  floor: z.number().int().min(1).max(200),
  capacity: z.number().int().min(1).max(500).nullable().default(null),
  description: z.string().trim().max(500).nullable().default(null),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "입력값이 올바르지 않습니다.");

  const exists = await prisma.room.findUnique({ where: { number: parsed.data.number } });
  if (exists) return jsonError(409, "이미 존재하는 회의실 번호입니다.");

  const maxSort = await prisma.room.aggregate({ _max: { sortOrder: true } });
  const room = await prisma.room.create({
    data: { ...parsed.data, sortOrder: (maxSort._max.sortOrder ?? 0) + 1 },
  });
  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "ROOM_CREATE", detail: { number: room.number, floor: room.floor } },
  });
  return NextResponse.json({ ok: true, room });
}
