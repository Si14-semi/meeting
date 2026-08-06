import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, isResponse, jsonError } from "@/lib/api";
import { reservationInclude, serializeReservation } from "@/lib/reservations";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return jsonError(400, "검색어를 입력해주세요.");

  const reservations = await prisma.reservation.findMany({
    where: {
      OR: [
        { purpose: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { room: { number: { contains: q } } },
      ],
    },
    include: reservationInclude,
    orderBy: [{ date: "desc" }, { startMin: "asc" }],
    take: 200,
  });

  return NextResponse.json({ results: reservations.map(serializeReservation) });
}
