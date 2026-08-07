import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// 배포 스크립트(deploy.ps1)가 재시작 후 기동 확인용으로 폴링한다. 인증 없음(middleware PUBLIC_API).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch {
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 500 });
  }
}
