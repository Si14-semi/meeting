import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, isResponse, jsonError } from "@/lib/api";

const MAX_ACTIVE = 2;

const patchSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  content: z.string().trim().min(1).max(2000).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "입력값이 올바르지 않습니다.");

  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice) return jsonError(404, "공지를 찾을 수 없습니다.");

  if (parsed.data.active === true && !notice.active) {
    const activeCount = await prisma.notice.count({ where: { active: true } });
    if (activeCount >= MAX_ACTIVE) {
      return jsonError(409, `활성 공지는 최대 ${MAX_ACTIVE}개까지입니다.`);
    }
  }

  const updated = await prisma.notice.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true, notice: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await ctx.params;

  await prisma.notice.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
