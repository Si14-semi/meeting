import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, isResponse } from "@/lib/api";

export async function GET() {
  const admin = await requireAdmin();
  if (isResponse(admin)) return admin;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { reservations: true } } },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      mustChangePassword: u.mustChangePassword,
      createdAt: u.createdAt.toISOString().slice(0, 10),
      reservationCount: u._count.reservations,
    })),
  });
}
