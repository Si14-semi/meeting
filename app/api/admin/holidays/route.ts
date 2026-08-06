import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, isResponse, jsonError } from "@/lib/api";
import { isValidDateStr } from "@/lib/time";

const createSchema = z.object({
  date: z.string(),
  name: z.string().trim().min(1).max(50),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success || !isValidDateStr(parsed.data.date)) {
    return jsonError(400, "입력값이 올바르지 않습니다.");
  }
  const { date, name } = parsed.data;

  await prisma.holiday.upsert({ where: { date }, update: { name }, create: { date, name } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const date = req.nextUrl.searchParams.get("date");
  if (!date || !isValidDateStr(date)) return jsonError(400, "date 파라미터가 필요합니다.");

  await prisma.holiday.delete({ where: { date } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
