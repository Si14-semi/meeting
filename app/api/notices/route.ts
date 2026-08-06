import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, isResponse } from "@/lib/api";

/** 활성 공지 (팝업용, 최대 2개) */
export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;

  const notices = await prisma.notice.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    take: 2,
  });
  return NextResponse.json({
    notices: notices.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      updatedAt: n.updatedAt.toISOString(), // "다시 보지 않기" 무효화 기준 (수정 시 재표시)
    })),
  });
}
