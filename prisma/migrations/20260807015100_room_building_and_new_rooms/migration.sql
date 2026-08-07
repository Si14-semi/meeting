-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "building" TEXT NOT NULL DEFAULT '평화';

-- 신규 건물 회의실 + 차량 등록 (사용자 확정)
-- 아리랑&신원: A1, A2, S1 / 차량: 6958, 6907, 6976, 2217
INSERT INTO "rooms" ("number", "building", "floor", "sortOrder", "active")
VALUES
  ('A1', '아리랑&신원', 1, 9, true),
  ('A2', '아리랑&신원', 1, 10, true),
  ('S1', '아리랑&신원', 1, 11, true),
  ('6958', '차량', 1, 12, true),
  ('6907', '차량', 1, 13, true),
  ('6976', '차량', 1, 14, true),
  ('2217', '차량', 1, 15, true)
ON CONFLICT ("number") DO NOTHING;
