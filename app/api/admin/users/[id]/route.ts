import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, isResponse, jsonError } from "@/lib/api";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;
  const { id } = await ctx.params;

  if (id === admin.id) return jsonError(400, "자기 자신은 삭제할 수 없습니다.");

  const user = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { reservations: true } } },
  });
  if (!user) return jsonError(404, "회원을 찾을 수 없습니다.");
  if (user.role === "ADMIN") return jsonError(400, "관리자 계정은 삭제할 수 없습니다.");

  await prisma.user.delete({ where: { id } }); // 예약도 cascade 삭제
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "DELETE_USER",
      detail: { email: user.email, name: user.name, deletedReservations: user._count.reservations },
    },
  });
  return NextResponse.json({ ok: true });
}
