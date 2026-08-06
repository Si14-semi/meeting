import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, isResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const from = req.nextUrl.searchParams.get("from") ?? "1900-01-01";
  const to = req.nextUrl.searchParams.get("to") ?? "2999-12-31";
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ holidays });
}
