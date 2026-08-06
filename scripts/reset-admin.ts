// 관리자 비밀번호 비상 리셋 스크립트.
// 사용법: DATABASE_URL 설정 후 `npx tsx scripts/reset-admin.ts <새비밀번호>`

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const newPassword = process.argv[2];
  if (!newPassword || newPassword.length < 8) {
    console.error("사용법: npx tsx scripts/reset-admin.ts <새비밀번호(8자 이상)>");
    process.exit(1);
  }
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) {
    console.error("관리자 계정이 없습니다. prisma db seed를 먼저 실행하세요.");
    process.exit(1);
  }
  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), mustChangePassword: true },
  });
  console.log(`관리자(${admin.email}) 비밀번호가 리셋되었습니다. 로그인 후 새 비밀번호 설정이 강제됩니다.`);
}

main().finally(() => prisma.$disconnect());
