import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, isResponse } from "@/lib/api";

export async function GET() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { admin: { select: { name: true, email: true } } },
  });
  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      detail: l.detail,
      adminName: l.admin.name,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
