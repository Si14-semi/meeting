# ============================================================
# Meeting Room 예약 — 일일 데이터 정리 호출 (Vercel Cron 대체)
# ============================================================
# Vercel 에서는 vercel.json 의 cron 이 /api/cron/cleanup 을 매일 호출했다.
# 사내서버에서는 Windows Task Scheduler 가 본 script 를 매일 호출한다 (가이드 E 섹션).
#
# CRON_SECRET 은 D:\Meeting\.env 에서 읽는다 — Task Scheduler 정의에 secret 을
# 심지 않기 위함.
#
# 수동 실행 예:
#   .\scripts\run-cleanup.ps1
# ============================================================

[CmdletBinding()]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [int]   $Port        = 3001,
    [string]$LogDir      = "D:\Logs\Meeting\cleanup"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}
$logFile = Join-Path $LogDir "cleanup.log"

function Write-Log {
    param([string]$Message)
    $line = "{0} {1}" -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding utf8
}

# ----- .env 에서 CRON_SECRET 읽기 -----
$envFile = Join-Path $ProjectRoot '.env'
if (-not (Test-Path $envFile)) {
    Write-Log "FAIL — .env not found at $envFile"
    exit 1
}

$secret = $null
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*CRON_SECRET\s*=\s*(.+?)\s*$') {
        $secret = $Matches[1].Trim('"').Trim("'")
        break
    }
}
if (-not $secret) {
    Write-Log "FAIL — CRON_SECRET not set in .env"
    exit 1
}

# ----- cleanup 엔드포인트 호출 -----
try {
    $resp = Invoke-WebRequest -UseBasicParsing `
        -Uri "http://localhost:$Port/api/cron/cleanup" `
        -Headers @{ Authorization = "Bearer $secret" } `
        -TimeoutSec 60
    Write-Log "OK $($resp.StatusCode) $($resp.Content)"
    exit 0
} catch {
    Write-Log "FAIL — $($_.Exception.Message)"
    exit 1
}
