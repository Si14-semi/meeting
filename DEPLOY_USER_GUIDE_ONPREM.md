# Meeting Room 예약 — 사내서버 배포 가이드 (초기 구축 + Neon 데이터 이관)

> 회사 보안 정책(외부 서버 사용 불가)에 따라 Vercel/Neon 에서 **사내 Windows 서버**로
> 이전하는 절차서입니다. PM Tool 배포와 같은 방식(오프라인 번들 zip + NSSM + deploy.ps1)
> 이며, **pm web 이 이미 운영 중인 그 서버에 그대로 공존**합니다.
>
> Vercel 배포/코드는 그대로 유지됩니다 — 이 가이드는 배포 대상을 하나 추가할 뿐입니다.

---

## 0. 구성 요약 (pm web 과 비교)

| 항목 | pm web | **Meeting** |
|------|--------|-------------|
| 설치 경로 | `D:\PM` | **`D:\Meeting`** |
| NSSM 서비스 | `pm-backend` | **`meeting-web`** |
| 포트 | 8080 | **3001** → 접속 `http://<서버IP>:3001` |
| DB / 계정 | `pm_prod` / `pm_app` | **`meeting_prod` / `meeting_app`** (같은 PostgreSQL 18 인스턴스) |
| DB 백업 | `D:\Backup\PM` | **`D:\Backup\Meeting`** (매일 03:00, 30일 보존) |
| 로그 | `D:\Logs\PM\` | **`D:\Logs\Meeting\`** (service / deploy / cleanup) |
| 일일 정리 | — | **작업 스케줄러 → run-cleanup.ps1** (Vercel Cron 대체, 1년 경과 데이터 삭제) |
| 실행 방식 | node dist\index.js | **node node_modules\next\dist\bin\next start -p 3001** |
| 서버 빌드 | deploy.ps1 이 빌드 | **서버 빌드 없음** — 개발 PC 빌드 결과(.next)를 번들로 반입 |

> 🔴 **`nssm` / `deploy.ps1` / `install-service.ps1` 은 반드시 "관리자 권한 PowerShell" 에서
> 운영자 본인이 직접 실행하세요** (pm web 가이드와 동일 원칙 — AI 에이전트 셸은 비관리자라
> `Access is denied` 로 실패합니다).

---

# 🅐 개발 PC (D:\Project\Meeting) — 오프라인 번들 zip 만들기

## 단계 A1 — 번들 생성

```powershell
cd D:\Project\Meeting
.\scripts\build-deploy-zip.ps1 -Label v1
```

이 스크립트가 자동으로 수행:
1. `npm ci` + `npm run build:onprem` (prisma generate + next build — **migrate 는 안 함**, Neon 을 건드리지 않음)
2. 소스 복사 (`.env*` / `.git` / `.claude` 제외)
3. `node_modules` + `.next` 복사 (오프라인 운영용, `.next\cache` 제외)
4. `.NET ZipFile` 로 zip 생성 → **`D:\meeting-bundle-v1-<날짜>.zip`**
5. **자동 sanity check** — `.next\BUILD_ID` 포함 / `node_modules` 포함 / `prisma\migrations` 포함 / `.env` 미포함

`=== Bundle ready ===` + 모든 항목 `OK` 확인 → zip 을 운영 서버 `D:\Temp\` 로 전달 (USB/SMB/RDP).

## 단계 A2 — Neon 데이터 dump (전환일에 — 아래 🅓 참조)

초기 설치·동작 검증까지는 빈 DB 로 진행하고, **전환일에만** 이 단계를 수행합니다.

```powershell
# Neon 연결 문자열은 Vercel 환경변수(DATABASE_URL)와 동일한 값
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" `
    "<Neon DATABASE_URL (postgresql://...sslmode=require)>" `
    --format=custom --no-owner --no-acl `
    --file=D:\meeting-neon.dump
```

→ `D:\meeting-neon.dump` 를 운영 서버 `D:\Temp\` 로 전달.

---

# 🅑 운영 서버 — 1회 초기 구축

## 단계 B1 — DB 생성 (postgres superuser)

`scripts\setup-db.sql` 을 열어 `CHANGE_ME_STRONG_PASSWORD` 를 운영용 비밀번호로 수정한 뒤:

```powershell
psql -U postgres -f D:\Temp\setup-db.sql
```

> zip 압축 해제 전이면 zip 안의 `scripts\setup-db.sql` 을 꺼내 쓰거나, 해제 후
> `D:\Meeting\scripts\setup-db.sql` 로 실행해도 됩니다.

## 단계 B2 — 번들 압축 해제 + .env 작성

```powershell
Expand-Archive -Path D:\Temp\meeting-bundle-v1-<날짜>.zip -DestinationPath D:\Meeting -Force
Copy-Item D:\Meeting\.env.onprem.example D:\Meeting\.env
notepad D:\Meeting\.env
```

`.env` 에 채울 값 (자세한 설명은 파일 내 주석):
- `DATABASE_URL` — B1 에서 정한 `meeting_app` 비밀번호 반영
- `AUTH_SECRET` / `CRON_SECRET` — 무작위 문자열 생성
- `COOKIE_SECURE=false` — **HTTP 운영 필수** (없으면 로그인 불가)

`.env` 는 pm web 과 동일하게 NTFS 권한으로 admin 만 접근하도록 설정 권장.

## 단계 B3 — 서비스 등록 + 첫 배포 (👤 관리자 PowerShell)

```powershell
cd D:\Meeting
.\scripts\install-service.ps1              # meeting-web 등록 (stopped 상태)

$env:PGPASSWORD = "<meeting_app 비밀번호>"
.\scripts\deploy.ps1 -SkipBackup           # 첫 회만 -SkipBackup (빈 DB — 백업할 것이 없음)
```

`deploy.ps1` 이 순서대로: prisma generate → **migrate deploy (테이블 생성)** → 서비스 시작 → `/api/health` 폴링.
`[deploy] All steps OK` 가 뜨면 성공.

## 단계 B4 — 동작 확인

- 서버에서: `curl http://localhost:3001/api/health` → `{"status":"ok","db":"ok"}`
- 다른 PC 브라우저: `http://<서버IP>:3001` → 로그인 화면
  - 안 열리면 **Windows 방화벽 인바운드 규칙**에 TCP 3001 허용 추가 (pm web 8080 과 동일하게)
- 시험 계정 가입 → 로그인 → 예약 생성/취소 → 관리자 화면 확인

> 이 시점의 DB 는 빈 상태(시험 데이터만)입니다. 실데이터는 🅓 전환일에 이관합니다.

---

# 🅒 운영 서버 — 스케줄 작업 등록 (1회)

## C1 — 일일 데이터 정리 (Vercel Cron 대체, 매일 03:30)

```powershell
schtasks /Create /TN "Meeting-Cleanup" /SC DAILY /ST 03:30 /RU SYSTEM `
    /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\Meeting\scripts\run-cleanup.ps1"
```

- 1년 경과한 예약/감사로그를 삭제합니다 (기존 Vercel Cron 과 동일 정책).
- `CRON_SECRET` 은 `.env` 에서 읽으므로 작업 정의에 secret 이 남지 않습니다.
- 결과 로그: `D:\Logs\Meeting\cleanup\cleanup.log`
- 즉시 시험: `schtasks /Run /TN "Meeting-Cleanup"` 후 로그에 `OK 200` 확인.

## C2 — 일일 DB 백업 (매일 03:00, 30일 보존)

```powershell
schtasks /Create /TN "Meeting-DB-Backup" /SC DAILY /ST 03:00 /RU SYSTEM `
    /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"$env:PGPASSWORD='<meeting_app 비밀번호>'; D:\Meeting\scripts\backup.ps1 -DbName meeting_prod\""
```

> 비밀번호를 작업 정의에 넣고 싶지 않으면 pm web 과 동일하게
> `%APPDATA%\postgresql\pgpass.conf` (SYSTEM 계정 기준) 방식을 사용하세요.

---

# 🅓 전환일 — Neon 실데이터 이관 (👤 관리자 PowerShell)

> 직원 공지(예: "금요일 18시 이후 예약 입력 금지, 월요일부터 새 주소 사용") 후,
> 신규 예약이 없는 시간대에 진행. 소요 수 분.

1. **개발 PC**: 단계 A2 로 Neon dump 생성 → `D:\Temp\meeting-neon.dump` 반입
2. **운영 서버**: 복원 (스크립트가 자동으로: 현재 상태 안전 dump → 서비스 정지 → 복원 → 재시작 → health)

```powershell
cd D:\Meeting
$env:PGPASSWORD = "<meeting_app 비밀번호>"
.\scripts\restore-from-backup.ps1 -DumpFile D:\Temp\meeting-neon.dump
```

3. **확인**: 브라우저에서 기존 계정으로 로그인(비밀번호 해시가 그대로 이관됨) → 기존 예약 조회
   - `AUTH_SECRET` 이 Vercel 과 다르면 기존 브라우저 세션은 무효 — **전 직원 재로그인 1회** (공지에 포함)
4. **직원 공지**: 새 주소 `http://<서버IP>:3001` 안내
5. **Vercel 정리**: Vercel 대시보드에서 프로젝트 일시 중지(또는 배포 보호 켜기)로 접근 차단.
   코드/배포 이력은 남겨둬도 무방. 완전 정리 시점에 Neon 데이터 삭제 여부는 전산담당자와 협의.

> dump 에는 `_prisma_migrations` 테이블도 포함되므로 이후 `deploy.ps1` 의 migrate 단계와
> 충돌하지 않습니다 (Neon 과 사내 DB 의 migration 이력이 동일해짐).

---

# 🅔 이후 업데이트 배포 (routine — pm web 과 동일 흐름)

```
[개발 PC]
  1. 코드 수정 + git commit
  2. .\scripts\build-deploy-zip.ps1 -Label v2   → zip 을 운영 서버 D:\Temp\ 로

[운영 서버]  (👤 관리자 PowerShell)
  3. nssm stop meeting-web
  4. 코드 백업(빠른 롤백용) + 번들 반영:
       $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
       robocopy D:\Meeting "D:\Meeting-backup-$stamp" /MIR /XD node_modules .next /XF .env /NFL /NDL /NJH /NJS
       Expand-Archive -Path D:\Temp\meeting-bundle-v2-<날짜>.zip -DestinationPath D:\Temp\meeting-v2 -Force
       robocopy D:\Temp\meeting-v2 D:\Meeting /MIR /XF .env /NFL /NDL /NJH /NJS
       Get-Content D:\Meeting\.env -TotalCount 3      # 기존 .env 생존 확인
  5. $env:PGPASSWORD = "<meeting_app 비밀번호>"
     .\scripts\deploy.ps1        # 백업 → migrate → 재시작 → health 자동
```

**실패 시 롤백**:
```powershell
nssm stop meeting-web
robocopy D:\Meeting-backup-<stamp> D:\Meeting /MIR /XF .env /NFL /NDL /NJH /NJS
nssm start meeting-web
# DB 까지 되돌려야 하면 (deploy.ps1 이 남긴 직전 백업으로):
.\scripts\restore-from-backup.ps1
```

---

## 📌 한 화면 요약 (초기 구축)

```
[개발 PC]
  A1. build-deploy-zip.ps1 -Label v1  → D:\meeting-bundle-v1-<날짜>.zip → 서버 반입

[운영 서버]  (👤 관리자 PowerShell)
  B1. setup-db.sql (meeting_app / meeting_prod 생성 — 비밀번호 먼저 수정!)
  B2. zip → D:\Meeting 해제, .env 작성 (COOKIE_SECURE=false 필수)
  B3. install-service.ps1 → deploy.ps1 -SkipBackup
  B4. http://<서버IP>:3001 접속 확인 (방화벽 TCP 3001 허용)
  C1. schtasks: Meeting-Cleanup (매일 03:30)
  C2. schtasks: Meeting-DB-Backup (매일 03:00)

[전환일]
  D. Neon pg_dump → restore-from-backup.ps1 -DumpFile → 직원 공지 → Vercel 접근 차단
```

## 자주 걸리는 문제

| 증상 | 원인 / 조치 |
|------|-------------|
| 로그인 버튼을 눌러도 다시 로그인 화면 | `.env` 에 `COOKIE_SECURE=false` 누락 (HTTP 에서 secure 쿠키는 브라우저가 저장 안 함) |
| 다른 PC 에서 접속 불가 | 방화벽 TCP 3001 인바운드 미허용 |
| `nssm ... Access is denied` | 비관리자 PowerShell — 관리자 권한으로 다시 실행 |
| deploy.ps1 이 `.next\BUILD_ID` 없다고 중단 | 번들이 `-SkipBuild` 로 잘못 생성됨 — 개발 PC 에서 재생성 |
| health 폴링 실패 | `D:\Logs\Meeting\service\meeting-web.stderr.log` 확인 (대부분 DATABASE_URL 오타) |
| 이관 후 로그인 안 됨 | 정상 — `AUTH_SECRET` 변경으로 세션 무효. 아이디/비밀번호로 재로그인 |
