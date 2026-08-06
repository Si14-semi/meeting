-- 같은 회의실·같은 날짜에서 시간 범위가 겹치는 예약을 DB 레벨에서 원천 차단.
-- 두 사용자가 동시에 예약해도 한쪽은 반드시 실패한다 (에러코드 23P01).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_no_overlap"
  EXCLUDE USING gist (
    "roomId" WITH =,
    "date" WITH =,
    int4range("startMin", "endMin") WITH &&
  );
