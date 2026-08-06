import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { isAllowedEmail, setSessionCookie, EMAIL_DOMAIN } from "@/lib/auth";
import { jsonError } from "@/lib/api";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("올바른 이메일 형식이 아닙니다."),
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(30),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(100),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }
  const { email, name, password } = parsed.data;

  if (!isAllowedEmail(email)) {
    return jsonError(400, `@${EMAIL_DOMAIN} 이메일만 가입할 수 있습니다.`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return jsonError(409, "이미 가입된 이메일입니다.");
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  await setSessionCookie({ uid: user.id, role: user.role });
  return NextResponse.json({ ok: true });
}
