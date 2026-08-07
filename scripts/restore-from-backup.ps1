# ============================================================
# Meeting Room 예약 — DB 복원 스크립트 (백업 dump → meeting_prod)
# ============================================================
# BackupDir 에서 가장 최신 dump 를 골라 복원한다. 복원 직전에 현재 상태를
# 안전 dump 로 한 번 더 떠 두므로, 복원 자체도 되돌릴 수 있다.
#
# 사용처:
#   - deploy.ps1 실패 후 롤백
#   - Neon → 사내 이관 시에도 동일 방식 사용 가능 (-DumpFile 로 Neon dump 지정)
#
# 실행 (관리자 PowerShell — 마지막에 서비스 재시작 포함):
#   $env:PGPASSWORD = "<meeting_app 비밀번호>"
#   .\scripts\restore-from-backup.ps1                          # 최신 백업으로 복원
#   .\scripts\restore-from-backup.ps1 -DumpFile D:\meeting-neon.dump   # 특정 dump 복원 (이관)
# ============================================================

[CmdletBinding()]
param(
    [string]$DbName      = "meeting_prod",
    [string]$DbUser      = "meeting_app",
    [string]$DbHost      = "localhost",
    [int]   $DbPort      = 5432,
    [string]$BackupDir   = "D:\Backup\Meeting",
    [string]$DumpFile    = "",              # 비우면 BackupDir 의 최신 dump 자동 선택
    [string]$ServiceName = "meeting-web",
    [int]   $HealthPort  = 3001,
    [switch]$NoServiceRestart,              # 서비스 제어 없이 DB 복원만
    [string]$PgBin       = ""
)

$ErrorActionPreference = "Stop"

# ----- pg_restore / pg_dump 위치 확인 -----
function Find-PgTool {
    param([string]$Name)
    if ($PgBin) {
        $candidate = Join-Path $PgBin "$Name.exe"
        if (Test-Path $candidate) { return $candidate }
    }
    $cmd = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($v in @('18', '17', '16')) {
        $p = "C:\Program Files\PostgreSQL\$v\bin\$Name.exe"
        if (Test-Path $p) { return $p }
    }
    return $null
}

$pgRestoreExe = Find-PgTool 'pg_restore'
if (-not $pgRestoreExe) {
    Write-Error "[restore] pg_restore.exe not found. Pass -PgBin 'C:\Path\To\PostgreSQL\bin'."
    exit 2
}

# ----- 복원할 dump 결정 -----
if ($DumpFile) {
    if (-not (Test-Path $DumpFile)) {
        Write-Error "[restore] DumpFile not found: $DumpFile"
        exit 2
    }
} else {
    $latest = Get-ChildItem -Path $BackupDir -Filter "${DbName}_*.dump" -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending |
              Select-Object -First 1
    if (-not $latest) {
        Write-Error "[restore] No dump found in $BackupDir (pattern: ${DbName}_*.dump)"
        exit 2
    }
    $DumpFile = $latest.FullName
}
Write-Host "[restore] Restore source: $DumpFile"

# ----- 복원 직전 현재 상태 안전 dump -----
Write-Host "[restore] Taking safety dump of CURRENT state first..."
& "$PSScriptRoot\backup.ps1" -DbName $DbName -DbUser $DbUser -DbHost $DbHost -DbPort $DbPort -BackupDir $BackupDir -PgBin $PgBin
if ($LASTEXITCODE -ne 0) {
    Write-Error "[restore] Safety dump failed — aborting restore (current state is NOT protected)."
    exit 1
}

# ----- 서비스 정지 (복원 중 연결 차단) -----
if (-not $NoServiceRestart) {
    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
        Write-Host "[restore] Stopping service '$ServiceName'..."
        & nssm stop $ServiceName 2>$null
        Start-Sleep -Seconds 2
    }
}

# ----- pg_restore (--clean: 기존 객체 drop 후 재생성) -----
Write-Host "[restore] Running pg_restore into $DbName ..."
& $pgRestoreExe `
    --host=$DbHost `
    --port=$DbPort `
    --username=$DbUser `
    --dbname=$DbName `
    --clean --if-exists `
    --no-owner --no-acl `
    $DumpFile

if ($LASTEXITCODE -ne 0) {
    Write-Error "[restore] pg_restore FAILED (exit $LASTEXITCODE). 안전 dump 는 $BackupDir 에 보존되어 있습니다."
    exit 1
}
Write-Host "[restore] OK — database restored."

# ----- 서비스 재시작 + health -----
if (-not $NoServiceRestart) {
    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
        Write-Host "[restore] Starting service '$ServiceName'..."
        & nssm start $ServiceName
        Start-Sleep -Seconds 3
        try {
            $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$HealthPort/api/health" -TimeoutSec 10
            Write-Host "[restore] /api/health -> $($resp.StatusCode) $($resp.Content)"
        } catch {
            Write-Warning "[restore] Health check failed: $($_.Exception.Message) — 로그 확인: D:\Logs\Meeting\service\"
        }
    }
}

Write-Host "[restore] Done."
exit 0
