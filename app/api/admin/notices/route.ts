import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, isResponse, jsonError } from "@/lib/api";

const MAX_ACTIVE = 2;

export async function GET() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const notices = await prisma.notice.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    notices: notices.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      active: n.active,
      createdAt: n.createdAt.toISOString().slice(0, 10),
    })),
  });
}

const createSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(100),
  content: z.string().trim().min(1, "내용을 입력해주세요.").max(2000),
  active: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다.");
  }

  if (parsed.data.active) {
    const activeCount = await prisma.notice.count({ where: { active: true } });
    if (activeCount >= MAX_ACTIVE) {
      return jsonError(409, `활성 공지는 최대 ${MAX_ACTIVE}개까지입니다. 기존 공지를 비활성화한 후 등록해주세요.`);
    }
  }

  const notice = await prisma.notice.create({ data: parsed.data });
  return NextResponse.json({ ok: true, notice });
}
