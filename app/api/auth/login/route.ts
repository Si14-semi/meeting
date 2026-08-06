import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { jsonError } from "@/lib/api";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "이메일과 비밀번호를 입력해주세요.");
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // 이메일 존재 여부를 구분해서 알려주지 않는다 (계정 탐색 방지)
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return jsonError(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
  }

  await setSessionCookie({ uid: user.id, role: user.role });
  return NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword });
}
