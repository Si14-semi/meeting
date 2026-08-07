# ============================================================
# Meeting Room 예약 — NSSM service install (Windows native)
# ============================================================
# 운영 서버에서 Meeting 앱(next start)을 Windows Service 로 등록.
# 단일 프로세스가 port 3001 에서 웹+API 동시 서빙 (pm-backend 의 8080 과 공존).
#
# 사전 조건 (서버 1회만 수행):
#   - Node.js LTS (>= 20) / NSSM / PostgreSQL 18 — pm web 운영 중이므로 이미 충족
#   - scripts\setup-db.sql 로 meeting_app role + meeting_prod DB 생성
#   - 오프라인 번들을 D:\Meeting 에 압축 해제 (.next + node_modules 포함)
#   - D:\Meeting\.env 작성 (.env.onprem.example 참조)
#
# 본 script 는 service 등록만 수행. 시작은 deploy.ps1 또는 `nssm start meeting-web`.
#
# 실행 (관리자 PowerShell):
#   .\scripts\install-service.ps1
#
# 다른 경로/포트로 운영하려면:
#   .\scripts\install-service.ps1 -ProjectRoot "E:\Meeting" -Port 3002
# ============================================================

[CmdletBinding()]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$ServiceName = "meeting-web",
    [string]$DisplayName = "Dongwoon Meeting Room — Web",
    [string]$Description = "Meeting room reservation web (Next.js, port 3001).",
    [int]   $Port        = 3001,
    [string]$BindHost    = "0.0.0.0",
    [string]$LogDir      = "D:\Logs\Meeting\service",
    [string]$NodeExe     = ""    # 비우면 자동 탐지 (PATH)
)

$ErrorActionPreference = "Stop"

# ----- nssm.exe 위치 확인 -----
$nssmCmd = Get-Command nssm.exe -ErrorAction SilentlyContinue
if (-not $nssmCmd) {
    Write-Error "[install-service] nssm.exe not found in PATH. Install NSSM (https://nssm.cc/) first."
    exit 2
}
$nssm = $nssmCmd.Source
Write-Host "[install-service] Using nssm: $nssm"

# ----- node.exe 위치 확인 -----
if (-not $NodeExe) {
    $nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Error "[install-service] node.exe not found in PATH. Install Node.js >= 20 first."
        exit 2
    }
    $NodeExe = $nodeCmd.Source
}
if (-not (Test-Path $NodeExe)) {
    Write-Error "[install-service] node.exe path invalid: $NodeExe"
    exit 2
}
Write-Host "[install-service] Using node: $NodeExe"

# ----- ProjectRoot 검증 -----
# next start 는 node_modules\next\dist\bin\next 를 node 로 직접 실행 (전역 next 불필요)
$nextCli  = Join-Path $ProjectRoot 'node_modules\next\dist\bin\next'
$buildId  = Join-Path $ProjectRoot '.next\BUILD_ID'
$envFile  = Join-Path $ProjectRoot '.env'

if (-not (Test-Path $nextCli)) {
    Write-Error "[install-service] Missing $nextCli. 오프라인 번들(node_modules 포함)을 먼저 압축 해제하세요."
    exit 2
}
if (-not (Test-Path $buildId)) {
    Write-Error "[install-service] Missing $buildId. 번들에 빌드 결과(.next)가 없습니다 — build-deploy-zip.ps1 로 다시 생성."
    exit 2
}
if (-not (Test-Path $envFile)) {
    Write-Error "[install-service] Missing $envFile. Copy .env.onprem.example -> .env and configure DATABASE_URL / AUTH_SECRET / CRON_SECRET / COOKIE_SECURE=false."
    exit 2
}
Write-Host "[install-service] ProjectRoot OK: $ProjectRoot"

# ----- Log 디렉토리 (service stdout/stderr) -----
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    Write-Host "[install-service] Created log dir: $LogDir"
}
$stdoutLog = Join-Path $LogDir "$ServiceName.stdout.log"
$stderrLog = Join-Path $LogDir "$ServiceName.stderr.log"

# ----- 기존 service 존재 시 안내 후 중단 -----
# ⚠ Get-Service 로 확인 (native `nssm status` 를 2>&1 캡처하면 신규 서버에서
#   NativeCommandError 로 설치가 중단됨 — PM install-service.ps1 과 동일 회피)
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-Error "[install-service] Service '$ServiceName' already registered. Run scripts\uninstall-service.ps1 first if you want to re-install."
    exit 3
}

# ----- 서비스 등록 -----
Write-Host "`n[install-service] Registering '$ServiceName' as Windows Service..."
Write-Host "  Application : $NodeExe"
Write-Host "  Arguments   : $nextCli start -p $Port -H $BindHost"
Write-Host "  AppDirectory: $ProjectRoot"
Write-Host "  Stdout log  : $stdoutLog"
Write-Host "  Stderr log  : $stderrLog"

& $nssm install $ServiceName $NodeExe $nextCli start -p $Port -H $BindHost
if ($LASTEXITCODE -ne 0) { Write-Error "[install-service] nssm install failed (exit $LASTEXITCODE)"; exit 1 }

# 메타데이터 + 환경변수 + 로그
# AppDirectory = repo root — next start 가 여기의 .next 와 .env 를 읽는다.
& $nssm set $ServiceName AppDirectory $ProjectRoot           | Out-Null
& $nssm set $ServiceName DisplayName $DisplayName            | Out-Null
& $nssm set $ServiceName Description $Description            | Out-Null
& $nssm set $ServiceName AppEnvironmentExtra "NODE_ENV=production" | Out-Null

# Log 파일 + rotation (10MB 초과 시 회전)
& $nssm set $ServiceName AppStdout $stdoutLog                | Out-Null
& $nssm set $ServiceName AppStderr $stderrLog                | Out-Null
& $nssm set $ServiceName AppRotateFiles 1                    | Out-Null
& $nssm set $ServiceName AppRotateOnline 1                   | Out-Null
& $nssm set $ServiceName AppRotateBytes 10485760             | Out-Null     # 10 MB

# 자동 시작 + graceful stop
& $nssm set $ServiceName Start SERVICE_AUTO_START            | Out-Null
& $nssm set $ServiceName AppStopMethodSkip 0                 | Out-Null
& $nssm set $ServiceName AppStopMethodConsole 15000          | Out-Null
& $nssm set $ServiceName AppStopMethodWindow 5000            | Out-Null
& $nssm set $ServiceName AppStopMethodThreads 5000           | Out-Null

# Crash 복구: 5초 대기 후 자동 재시작 (무한 루프 방지 throttle 60초)
& $nssm set $ServiceName AppExit Default Restart             | Out-Null
& $nssm set $ServiceName AppRestartDelay 5000                | Out-Null
& $nssm set $ServiceName AppThrottle 60000                   | Out-Null

# DependOnService — PostgreSQL 이 먼저 올라와야 함
$pgService = Get-Service -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -like 'postgresql*' } |
             Select-Object -First 1
if ($pgService) {
    & $nssm set $ServiceName DependOnService $pgService.Name | Out-Null
    Write-Host "  Dependency  : $($pgService.Name)"
} else {
    Write-Warning "  No 'postgresql*' service detected — set DependOnService manually if needed."
}

Write-Host "`n[install-service] OK — service '$ServiceName' registered (status: stopped)."
Write-Host "[install-service] Next steps:"
Write-Host "    1) Verify config:       nssm dump $ServiceName"
Write-Host "    2) First deploy:        .\scripts\deploy.ps1 -SkipBackup   (빈 DB 초기 설치)"
Write-Host "    3) Check health:        curl http://localhost:$Port/api/health"
Write-Host "    4) Tail stdout:         Get-Content -Wait $stdoutLog"
exit 0
