# ============================================================
# Meeting Room 예약 — PostgreSQL 백업 스크립트
# ============================================================
# pg_dump.exe 로 DB 를 dump 하여 지정 디렉토리에 저장.
# 파일명: <DBNAME>_YYYYMMDD-HHMMSS.dump  (KST timestamp)
#
# 운영 정책 (PM Tool backup.ps1 과 동일 관례):
#   - 저장 위치: D:\Backup\Meeting\
#   - 보존:     일일 백업 30일 (오래된 파일 자동 삭제)
#   - 자동화:   Windows Task Scheduler 로 매일 새벽 3시 호출 (가이드 E 섹션)
#
# 사전 요구사항:
#   - pg_dump.exe (PATH 에 없으면 -PgBin 파라미터 또는 표준 설치 경로 자동 탐지)
#   - 환경변수 PGPASSWORD 또는 %APPDATA%\postgresql\pgpass.conf 로 비밀번호 자동화
#
# 수동 실행 예 (운영 서버):
#   $env:PGPASSWORD = "<meeting_app 비밀번호>"
#   .\scripts\backup.ps1 -DbName meeting_prod
# ============================================================

[CmdletBinding()]
param(
    [string]$DbName        = "meeting_prod",
    [string]$DbUser        = "meeting_app",
    [string]$DbHost        = "localhost",
    [int]   $DbPort        = 5432,
    [string]$BackupDir     = "D:\Backup\Meeting",
    [int]   $RetentionDays = 30,
    [string]$PgBin         = ""    # 비우면 자동 탐지 (PATH → 표준 설치 경로)
)

$ErrorActionPreference = "Stop"

# ----- pg_dump.exe 위치 확인 (PATH → 표준 설치 경로 fallback) -----
$pgDumpExe = $null

if ($PgBin) {
    $candidate = Join-Path $PgBin "pg_dump.exe"
    if (Test-Path $candidate) { $pgDumpExe = $candidate }
}

if (-not $pgDumpExe) {
    $cmd = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
    if ($cmd) { $pgDumpExe = $cmd.Source }
}

if (-not $pgDumpExe) {
    $standardPaths = @(
        "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
    )
    foreach ($p in $standardPaths) {
        if (Test-Path $p) { $pgDumpExe = $p; break }
    }
}

if (-not $pgDumpExe) {
    Write-Error "[backup] pg_dump.exe not found. Pass -PgBin 'C:\Path\To\PostgreSQL\bin' or add to PATH."
    exit 2
}

Write-Host "[backup] Using pg_dump: $pgDumpExe"

# ----- 백업 디렉토리 확인 (없으면 생성) -----
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    Write-Host "[backup] Created backup directory: $BackupDir"
}

# ----- 파일명 생성 (KST timestamp) -----
$timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$dumpFile  = Join-Path $BackupDir "${DbName}_${timestamp}.dump"

Write-Host "[backup] Starting pg_dump..."
Write-Host "[backup]   DB:     $DbName"
Write-Host "[backup]   User:   $DbUser"
Write-Host "[backup]   Host:   ${DbHost}:${DbPort}"
Write-Host "[backup]   Output: $dumpFile"

# ----- pg_dump 실행 (custom format = -Fc, 압축, pg_restore 로 복구) -----
& $pgDumpExe `
    --host=$DbHost `
    --port=$DbPort `
    --username=$DbUser `
    --format=custom `
    --no-owner `
    --no-acl `
    --file=$dumpFile `
    $DbName

if ($LASTEXITCODE -ne 0) {
    Write-Error "[backup] pg_dump FAILED with exit code $LASTEXITCODE"
    if (Test-Path $dumpFile) { Remove-Item $dumpFile -Force }
    exit 1
}

$sizeMB = [math]::Round((Get-Item $dumpFile).Length / 1MB, 2)
Write-Host "[backup] OK - $sizeMB MB written ($dumpFile)"

# ----- 오래된 파일 정리 (RetentionDays 초과) -----
Write-Host "[backup] Cleaning up files older than $RetentionDays days..."
$cutoff   = (Get-Date).AddDays(-$RetentionDays)
$oldFiles = Get-ChildItem -Path $BackupDir -Filter "${DbName}_*.dump" |
            Where-Object { $_.LastWriteTime -lt $cutoff }

if ($oldFiles) {
    foreach ($f in $oldFiles) {
        $age = [int]((Get-Date) - $f.LastWriteTime).TotalDays
        Remove-Item $f.FullName -Force
        Write-Host "[backup]   Deleted: $($f.Name) (age: $age days)"
    }
} else {
    Write-Host "[backup]   No old files to delete."
}

Write-Host "[backup] Done."
exit 0
