# meeting — 회의실 예약 시스템

Dongwoon Anatech 사내 회의실 예약 웹. PC와 모바일 모두 지원합니다.

- 회의실: 12층 (120~123호), 13층 (131~134호) — 관리자모드에서 추가/변경 가능
- 예약 시간: 08:00 ~ 19:00, 15분 단위
- 배포: Vercel (`dw-meeting.vercel.app`) + Neon PostgreSQL

## 주요 기능

| 기능 | 설명 |
|---|---|
| 예약 현황 | 가로축 회의실 × 세로축 시간 그리드. 예약자·목적 표시, 오늘은 현재 시각 라인 표시 |
| 예약 | 빈 시간 드래그(PC) 또는 탭(모바일) → 예약창. 목적은 선택 입력 |
| 반복 예약 | 매일/매주/매월/매년/맞춤. 종료일·횟수 지정 (미지정 시 1년). 일부 날짜 겹침 시 "가능한 날짜만 예약" 확인 |
| 수정·취소 | 본인 예약만 가능. 반복 예약은 이 일정 / 이 일정 및 향후 일정 / 모든 일정 3가지 범위 |
| PC 인터랙션 | 클릭=선택, 더블클릭=수정, 드래그=시간·회의실 이동, 위/아래 모서리 스트레치=시간 변경 |
| 모바일 | 층별 탭 + 좌우 스와이프. 드래그 편집은 PC 전용 |
| 검색 | 예약자·목적·회의실 번호로 전체 예약 검색 (날짜+요일 표기) |
| 내 예약 | 다가오는 예약(가까운 순) / 지난 예약 구분, 바로 수정 가능 |
| 로그인 | @dwanatech.com 이메일만 자유 가입. 로그인 1년 유지, 이메일 기억 옵션 |
| 관리자 | 회의실/층/공휴일 관리, 회원 관리(비밀번호 수동 리셋·삭제), 강제 예약 취소·수정, 감사 로그 |
| 데이터 보관 | 최근 1년만 보관 — 매일 새벽 3시(KST) 이전 데이터 자동 삭제 (Vercel Cron) |

## 정책 (확정 사항)

- 오늘 날짜는 지난 시간대에도 예약/수정 가능. **어제 이전 예약은 변경 불가** (조회만)
- 예약은 하루를 넘을 수 없음 (종일 = 08:00~19:00)
- 같은 회의실·시간대 중복 예약은 DB 제약(exclusion constraint)으로 원천 차단
- 비밀번호 재설정은 관리자 수동 리셋만 (임시 비밀번호 발급 → 첫 로그인 시 강제 변경)
- 반복 예약의 과거 인스턴스는 수정/삭제에 영향받지 않고 보존
- 공휴일은 DB 관리 (2026~2028 시드 포함, 이후 연도는 관리자모드에서 추가)

## 기술 스택

- **Next.js 15** (App Router) + TypeScript + Tailwind CSS v4
- **Prisma 6** + PostgreSQL (로컬: 전용 클러스터 / 운영: Neon)
- 인증: bcryptjs + JWT (httpOnly 쿠키, jose)
- 그리드 UI: 외부 라이브러리 없이 자체 구현

## 로컬 개발

```bash
# 1. 의존성 설치
npm install

# 2. 로컬 Postgres 기동 (전용 클러스터, 포트 5433)
#    최초 1회: initdb -D D:/Project/Meeting-devdb/data -U meeting_dev -A trust
"C:/Program Files/PostgreSQL/18/bin/pg_ctl" -D "D:/Project/Meeting-devdb/data" start

# 3. 마이그레이션 + 시드 (.env 는 로컬용으로 이미 구성됨)
npx prisma migrate dev
npx prisma db seed

# 4. 개발 서버
npm run dev
```

## Vercel 배포 절차

1. **GitHub**: 이 저장소를 GitHub private 저장소로 push
2. **Vercel**: New Project → GitHub 저장소 import (Framework: Next.js 자동 인식)
3. **Neon 연동**: Vercel 프로젝트 → Storage → Neon Postgres 생성/연결 → `DATABASE_URL` 자동 주입
4. **환경변수 설정** (Settings → Environment Variables, `.env.example` 참고):
   - `AUTH_SECRET`: `openssl rand -base64 32` 등으로 생성한 무작위 문자열
   - `CRON_SECRET`: 무작위 문자열 (Vercel Cron 인증용)
   - `ADMIN_EMAIL`, `ADMIN_INITIAL_PASSWORD`: 최초 관리자 계정
5. **DB 마이그레이션 + 시드** (로컬 PC에서 Neon을 향해 1회 실행):
   ```bash
   set DATABASE_URL=<Neon 연결 문자열>
   npx prisma migrate deploy
   npx prisma db seed
   ```
6. **도메인**: Settings → Domains 에서 `dw-meeting.vercel.app` 지정
7. 배포 후 관리자 계정으로 로그인 → 즉시 새 비밀번호 설정 (강제됨)

### 관리자 비밀번호 분실 시 (비상 절차)

관리자 본인의 비밀번호를 잊으면 웹에서 복구할 수 없습니다. 로컬 PC에서:

```bash
set DATABASE_URL=<Neon 연결 문자열>
npx tsx scripts/reset-admin.ts <새 임시 비밀번호>
```

## 알려진 한계

- 이메일 소유 확인 없음 (메일 발송 인프라 없음) — 도메인 제한 + 관리자 회원 정리로 대응
- 로그인 시도 횟수 제한 없음 — 필요 시 Vercel WAF/rate limit 추가 검토
- 화면 자동 갱신은 30초 폴링 — 그 사이 다른 사람 예약은 예약 시도 시 충돌 안내로 확인됨
