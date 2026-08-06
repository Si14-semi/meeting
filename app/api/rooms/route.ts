import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, isResponse } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const rooms = await prisma.room.findMany({
    where: { active: true },
    orderBy: [{ floor: "asc" }, { sortOrder: "asc" }, { number: "asc" }],
    select: { id: true, number: true, floor: true, capacity: true, equipment: true },
  });
  return NextResponse.json({ rooms });
}
