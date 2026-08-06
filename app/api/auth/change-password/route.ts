import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireUser, isResponse, jsonError } from "@/lib/api";

const schema = z.object({
  currentPassword: z.string().min(1, "현재 비밀번호를 입력해주세요."),
  newPassword: z.string().min(8, "새 비밀번호는 8자 이상이어야 합니다.").max(100),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const { currentPassword, newPassword } = parsed.data;

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser || !(await bcrypt.compare(currentPassword, dbUser.passwordHash))) {
    return jsonError(400, "현재 비밀번호가 올바르지 않습니다.");
  }
  if (currentPassword === newPassword) {
    return jsonError(400, "새 비밀번호가 현재 비밀번호와 같습니다.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 10),
      mustChangePassword: false,
    },
  });

  return NextResponse.json({ ok: true });
}
