import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin, isResponse, jsonError } from "@/lib/api";

/** 임시 비밀번호 생성 (혼동되기 쉬운 문자 제외, 10자리) */
function generateTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await ctx.params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return jsonError(404, "회원을 찾을 수 없습니다.");

  const tempPassword = generateTempPassword();
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await bcrypt.hash(tempPassword, 10),
      mustChangePassword: true,
    },
  });
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "RESET_PASSWORD",
      detail: { email: user.email, name: user.name },
    },
  });
  // 임시 비밀번호는 이 응답에서 한 번만 노출된다 (DB에는 해시만 저장)
  return NextResponse.json({ ok: true, tempPassword });
}
