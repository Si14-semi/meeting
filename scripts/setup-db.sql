-- ============================================================
-- Meeting Room 예약 — PostgreSQL Initial Setup (사내 운영 서버)
-- ============================================================
-- PM Tool 이 사용 중인 PostgreSQL 18 인스턴스에 Meeting 앱 전용
-- user 와 DB 를 추가 생성합니다. pm_prod 와 완전히 분리됩니다.
--
-- 실행 방법 (운영 서버, postgres superuser):
--   psql -U postgres -f scripts\setup-db.sql
--
-- ⚠ 실행 전 아래 CREATE USER 의 비밀번호를 운영용 강력한 값으로 수정할 것.
--   (여기서 정한 비밀번호를 D:\Meeting\.env 의 DATABASE_URL 에도 동일하게 기입)
-- ============================================================

-- ----------------------------------------------------------------
-- 1. 앱 전용 user 생성 (이미 있으면 skip — 멱등 보장)
-- ----------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meeting_app') THEN
        CREATE USER meeting_app WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
        RAISE NOTICE 'User meeting_app created.';
    ELSE
        RAISE NOTICE 'User meeting_app already exists, skipping CREATE USER.';
    END IF;
END
$$;

-- ----------------------------------------------------------------
-- 2. DB 생성 (meeting_prod) — 멱등
-- ----------------------------------------------------------------
-- CREATE DATABASE 는 트랜잭션 내부에서 실행 못 하므로 \gexec 사용.
SELECT 'CREATE DATABASE meeting_prod OWNER meeting_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'meeting_prod')\gexec

-- ----------------------------------------------------------------
-- 3. timezone 적용 (Asia/Seoul) — 새 connection 부터 적용
-- ----------------------------------------------------------------
ALTER DATABASE meeting_prod SET timezone TO 'Asia/Seoul';

-- ----------------------------------------------------------------
-- 4. 권한 부여 (owner 라 redundant 지만 명시적으로)
-- ----------------------------------------------------------------
GRANT ALL PRIVILEGES ON DATABASE meeting_prod TO meeting_app;

-- ----------------------------------------------------------------
-- 결과 안내
-- ----------------------------------------------------------------
\echo ''
\echo '================================================================'
\echo ' Meeting DB setup complete'
\echo '================================================================'
\echo ' user:     meeting_app  (비밀번호를 CHANGE_ME 로 두었다면 즉시 변경!)'
\echo ' DB:       meeting_prod'
\echo ' timezone: Asia/Seoul'
\echo ''
\echo ' Next steps:'
\echo '   1. D:\Meeting\.env 의 DATABASE_URL 에 위 계정/비밀번호 반영'
\echo '   2. DEPLOY_USER_GUIDE_ONPREM.md C 섹션(초기 설치)으로 진행'
\echo '================================================================'
