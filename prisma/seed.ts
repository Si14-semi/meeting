import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// 초기 회의실: 12층 120~123, 13층 131~134 (사용자 확정 사항)
const ROOMS = [
  { number: "120", floor: 12, sortOrder: 1 },
  { number: "121", floor: 12, sortOrder: 2 },
  { number: "122", floor: 12, sortOrder: 3 },
  { number: "123", floor: 12, sortOrder: 4 },
  { number: "131", floor: 13, sortOrder: 5 },
  { number: "132", floor: 13, sortOrder: 6 },
  { number: "133", floor: 13, sortOrder: 7 },
  { number: "134", floor: 13, sortOrder: 8 },
];

// 한국 공휴일 2026~2028 (대체공휴일 포함, 최선 반영 — 관리자모드에서 수정 가능)
const HOLIDAYS: [string, string][] = [
  // 2026
  ["2026-01-01", "신정"],
  ["2026-02-16", "설날 연휴"],
  ["2026-02-17", "설날"],
  ["2026-02-18", "설날 연휴"],
  ["2026-03-01", "삼일절"],
  ["2026-03-02", "대체공휴일(삼일절)"],
  ["2026-05-05", "어린이날"],
  ["2026-05-24", "부처님오신날"],
  ["2026-05-25", "대체공휴일(부처님오신날)"],
  ["2026-06-03", "지방선거"],
  ["2026-06-06", "현충일"],
  ["2026-08-15", "광복절"],
  ["2026-08-17", "대체공휴일(광복절)"],
  ["2026-09-24", "추석 연휴"],
  ["2026-09-25", "추석"],
  ["2026-09-26", "추석 연휴"],
  ["2026-10-03", "개천절"],
  ["2026-10-05", "대체공휴일(개천절)"],
  ["2026-10-09", "한글날"],
  ["2026-12-25", "성탄절"],
  // 2027
  ["2027-01-01", "신정"],
  ["2027-02-06", "설날 연휴"],
  ["2027-02-07", "설날"],
  ["2027-02-08", "설날 연휴"],
  ["2027-02-09", "대체공휴일(설날)"],
  ["2027-03-01", "삼일절"],
  ["2027-05-05", "어린이날"],
  ["2027-05-13", "부처님오신날"],
  ["2027-06-06", "현충일"],
  ["2027-08-15", "광복절"],
  ["2027-08-16", "대체공휴일(광복절)"],
  ["2027-09-14", "추석 연휴"],
  ["2027-09-15", "추석"],
  ["2027-09-16", "추석 연휴"],
  ["2027-10-03", "개천절"],
  ["2027-10-04", "대체공휴일(개천절)"],
  ["2027-10-09", "한글날"],
  ["2027-10-11", "대체공휴일(한글날)"],
  ["2027-12-25", "성탄절"],
  ["2027-12-27", "대체공휴일(성탄절)"],
  // 2028
  ["2028-01-01", "신정"],
  ["2028-01-26", "설날 연휴"],
  ["2028-01-27", "설날"],
  ["2028-01-28", "설날 연휴"],
  ["2028-03-01", "삼일절"],
  ["2028-04-12", "국회의원선거"],
  ["2028-05-02", "부처님오신날"],
  ["2028-05-05", "어린이날"],
  ["2028-06-06", "현충일"],
  ["2028-08-15", "광복절"],
  ["2028-10-02", "추석 연휴"],
  ["2028-10-03", "추석·개천절"],
  ["2028-10-04", "추석 연휴"],
  ["2028-10-05", "대체공휴일(개천절)"],
  ["2028-10-09", "한글날"],
  ["2028-12-25", "성탄절"],
];

async function main() {
  // 회의실
  for (const room of ROOMS) {
    await prisma.room.upsert({
      where: { number: room.number },
      update: {},
      create: room,
    });
  }

  // 공휴일
  for (const [date, name] of HOLIDAYS) {
    await prisma.holiday.upsert({
      where: { date },
      update: {},
      create: { date, name },
    });
  }

  // 관리자 계정 (환경변수로 초기 비밀번호 지정, 최초 로그인 시 강제 변경)
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (adminEmail && adminPassword) {
    const existing = await prisma.user.findUnique({ where: { email: adminEmail.toLowerCase() } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email: adminEmail.toLowerCase(),
          name: "관리자",
          passwordHash: await bcrypt.hash(adminPassword, 10),
          role: "ADMIN",
          mustChangePassword: true,
        },
      });
      console.log(`Admin account created: ${adminEmail}`);
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
