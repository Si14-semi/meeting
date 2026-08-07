# ============================================================
# Meeting Room 예약 — Deploy script (사내 Windows 운영 서버)
# ============================================================
# 오프라인 번들(zip: 소스 + node_modules + .next)이 D:\Meeting 에 반영된 상태에서 실행.
# 서버에서는 빌드하지 않는다 — 빌드 결과(.next)는 개발 PC 에서 만들어 번들로 반입.
#
# 본 script 가 보장하는 순서 (PM Tool deploy.ps1 과 동일 관례):
#   0. Preflight  — node/npm/nssm 존재, ProjectRoot(.next/node_modules/.env) 검증
#   1. Backup     — pg_dump 로 DB dump (실패 시 즉시 중단)
#   2. Prisma     — prisma generate (오프라인 no-op 안전) 확인
#   3. Migrate    — prisma migrate deploy
#   4. Service    — NSSM service 재시작
#   5. Health     — http://localhost:<port>/api/health 응답 확인 (deadline 폴링)
#
# 어떤 단계든 실패하면 즉시 중단하고 최신 backup 파일 경로 + 복구 명령을 출력.
#
# 실행 예 (운영 서버, 관리자 PowerShell 에서 — nssm 이 관리자 권한 필요):
#   $env:PGPASSWORD = "<meeting_app 비밀번호>"
#   .\scripts\deploy.ps1
# ============================================================

[CmdletBinding()]
param(
    # ProjectRoot 미지정 시 본 script 의 부모 디렉토리(=repo root). D:\Meeting\scripts\deploy.ps1 → D:\Meeting
    [string]$ProjectRoot       = (Split-Path -Parent $PSScriptRoot),
    [string]$DbName            = "meeting_prod",
    [string]$BackupDir         = "D:\Backup\Meeting",
    [string]$ServiceName       = "meeting-web",
    [int]   $HealthPort        = 3001,
    [int]   $HealthTimeoutSec  = 60,
    [string]$LogDir            = "D:\Logs\Meeting\deploy",
    [switch]$SkipBackup,             # 초기 설치(빈 DB) 또는 비상 redeploy 용
    [switch]$SkipMigrate,            # 드물게: code 만 배포, migration 보류
    [switch]$DryRun                  # 모든 변경 작업을 echo 만 (검증용)
)

$ErrorActionPreference = "Stop"

# ----- Transcript (감사용 로그) — 가장 먼저 시작 -----
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}
$logFile = Join-Path $LogDir ("deploy_{0}.log" -f (Get-Date).ToString("yyyyMMdd-HHmmss"))
Start-Transcript -Path $logFile -Force | Out-Null
Write-Host "[deploy] Transcript: $logFile`n"

# ----- 헬퍼 -----
$script:LastBackup = $null

function Write-Step {
    param([string]$Phase, [string]$Message)
    Write-Host "`n[deploy $Phase] $Message" -ForegroundColor Cyan
}

function Stop-WithGuidance {
    param([string]$Message, [int]$ExitCode = 1)
    Write-Host "`n[deploy FAIL] $Message" -ForegroundColor Red
    if ($script:LastBackup) {
        Write-Host "" -ForegroundColor Yellow
        Write-Host "[deploy FAIL] Pre-deploy backup was taken successfully:" -ForegroundColor Yellow
        Write-Host "    $script:LastBackup" -ForegroundColor Yellow
        Write-Host "" -ForegroundColor Yellow
        Write-Host "[deploy FAIL] DB 를 그 시점으로 되돌리려면:" -ForegroundColor Yellow
        Write-Host "    .\scripts\restore-from-backup.ps1 -DbName $DbName" -ForegroundColor Yellow
        Write-Host "" -ForegroundColor Yellow
    }
    Stop-Transcript | Out-Null
    exit $ExitCode
}

function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$Tool,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$ErrorMessage
    )
    if ($DryRun) {
        Write-Host "    [dry-run] $Tool $($Arguments -join ' ')"
        return
    }
    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) {
        Stop-WithGuidance "$ErrorMessage (exit $LASTEXITCODE)"
    }
}

# ============================================================
# 0. Preflight
# ============================================================
Write-Step "0/preflight" "verifying tools and project layout..."

foreach ($tool in @('node', 'npm', 'nssm')) {
    $cmd = Get-Command $tool -ErrorAction SilentlyContinue
    if (-not $cmd) {
        Stop-WithGuidance "'$tool' not found in PATH. Install it before deploying."
    }
    Write-Host "  OK $tool $(if ($cmd.Source) { '-> ' + $cmd.Source })"
}

# Node 버전 가드 (Next.js 15 는 >= 18.18, 운영 표준은 20 LTS)
$nodeVer = (& node --version).TrimStart('v')
if ([version]$nodeVer -lt [version]'20.0.0') {
    Stop-WithGuidance "Node.js $nodeVer < 20.0.0 required."
}
Write-Host "  OK node $nodeVer (>= 20)"

# ProjectRoot 검증 — Meeting repo 인지 + 오프라인 번들이 완전한지
if (-not (Test-Path (Join-Path $ProjectRoot 'prisma\schema.prisma'))) {
    Stop-WithGuidance "ProjectRoot '$ProjectRoot' does not look like the Meeting repo (no prisma\schema.prisma)."
}
if (-not (Test-Path (Join-Path $ProjectRoot '.next\BUILD_ID'))) {
    Stop-WithGuidance "Missing .next\BUILD_ID — 번들에 빌드 결과가 없습니다. dev PC 에서 build-deploy-zip.ps1 로 다시 번들 생성."
}
if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules\next\package.json'))) {
    Stop-WithGuidance "Missing node_modules\next — 오프라인 번들이 불완전합니다 (node_modules 미포함)."
}
Write-Host "  OK ProjectRoot: $ProjectRoot (.next + node_modules present)"

# .env 존재 확인 (next start 와 prisma CLI 가 이 파일을 읽음)
$envFile = Join-Path $ProjectRoot '.env'
if (-not (Test-Path $envFile)) {
    Stop-WithGuidance "Missing .env. Copy .env.onprem.example -> .env and set DATABASE_URL/AUTH_SECRET/CRON_SECRET/COOKIE_SECURE=false."
}
Write-Host "  OK .env present"

# ============================================================
# 1. Backup (실패 시 즉시 중단)
# ============================================================
if ($SkipBackup) {
    Write-Step "1/backup" "SKIPPED (--SkipBackup) — 초기 설치(빈 DB)가 아니라면 위험!"
} else {
    Write-Step "1/backup" "running scripts\backup.ps1 (DB: $DbName -> $BackupDir)..."
    if ($DryRun) {
        Write-Host "    [dry-run] would call backup.ps1"
    } else {
        & "$PSScriptRoot\backup.ps1" -DbName $DbName -BackupDir $BackupDir
        if ($LASTEXITCODE -ne 0) {
            Stop-WithGuidance "Backup failed — aborting before any changes are applied."
        }
        $latest = Get-ChildItem -Path $BackupDir -Filter "${DbName}_*.dump" |
                  Sort-Object LastWriteTime -Descending |
                  Select-Object -First 1
        if ($latest) { $script:LastBackup = $latest.FullName }
        Write-Host "  OK backup -> $script:LastBackup"
    }
}

# ============================================================
# 2. Prisma generate (번들에 이미 generate 된 client 포함 — 안전 차원 재실행, 오프라인 동작)
# ============================================================
Write-Step "2/prisma" "prisma generate (no-op if already current)..."
Push-Location $ProjectRoot
try {
    Invoke-Native -Tool 'npx' -Arguments @('prisma', 'generate') -ErrorMessage 'prisma generate failed'
    Write-Host "  OK prisma client ready"
} finally {
    Pop-Location
}

# ============================================================
# 3. Migrate (prisma migrate deploy)
# ============================================================
if ($SkipMigrate) {
    Write-Step "3/migrate" "SKIPPED (--SkipMigrate)"
} else {
    Write-Step "3/migrate" "applying prisma migrations to $DbName..."
    Push-Location $ProjectRoot
    try {
        Invoke-Native -Tool 'npx' -Arguments @('prisma', 'migrate', 'deploy') `
            -ErrorMessage 'prisma migrate deploy failed — DB schema may be partially applied. RESTORE FROM BACKUP before retry.'
        Write-Host "  OK migrations applied"
    } finally {
        Pop-Location
    }
}

# ============================================================
# 4. Service (NSSM restart)
# ============================================================
Write-Step "4/service" "restarting NSSM service '$ServiceName'..."
if ($DryRun) {
    Write-Host "    [dry-run] would: nssm restart $ServiceName"
} else {
    if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
        Stop-WithGuidance "NSSM service '$ServiceName' is not registered. Run scripts\install-service.ps1 first."
    }

    # 초기 설치 직후는 stopped 상태 — restart 대신 start 로 분기
    $svc = Get-Service -Name $ServiceName
    if ($svc.Status -eq 'Running') {
        & nssm restart $ServiceName
        if ($LASTEXITCODE -ne 0) {
            Stop-WithGuidance "nssm restart $ServiceName failed (exit $LASTEXITCODE)"
        }
    } else {
        & nssm start $ServiceName
        if ($LASTEXITCODE -ne 0) {
            Stop-WithGuidance "nssm start $ServiceName failed (exit $LASTEXITCODE)"
        }
    }
    Write-Host "  OK restart issued (NSSM returns before the process is fully ready — health check follows)"
}

# ============================================================
# 5. Health check (deadline polling, no infinite hang)
# ============================================================
Write-Step "5/health" "polling http://localhost:$HealthPort/api/health (deadline ${HealthTimeoutSec}s)..."
if ($DryRun) {
    Write-Host "    [dry-run] would poll /api/health"
} else {
    $deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
    $healthy  = $false
    $lastErr  = $null

    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$HealthPort/api/health" -TimeoutSec 5
            if ($resp.StatusCode -eq 200) {
                Write-Host "  OK /api/health -> 200"
                Write-Host "  body: $($resp.Content)"
                $healthy = $true
                break
            }
        } catch {
            $lastErr = $_.Exception.Message
        }
        Start-Sleep -Seconds 2
    }

    if (-not $healthy) {
        Write-Host "  last error: $lastErr" -ForegroundColor Yellow
        Stop-WithGuidance "Service did not become healthy within ${HealthTimeoutSec}s. Check D:\Logs\Meeting\service\*.log"
    }
}

# ============================================================
# Done
# ============================================================
Write-Host "`n[deploy] All steps OK. Service is live at http://<server-ip>:$HealthPort" -ForegroundColor Green
if ($script:LastBackup) {
    Write-Host "[deploy] Pre-deploy backup retained: $script:LastBackup" -ForegroundColor Green
}
Stop-Transcript | Out-Null
exit 0
