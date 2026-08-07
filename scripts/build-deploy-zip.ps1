# ============================================================
# Meeting Room 예약 — Deploy zip 생성 script (개발 PC 용)
# ============================================================
#
# 사내 운영 서버(오프라인 — npm registry 접근 불가)로 전달할 오프라인 번들 zip 생성.
# PM Tool build-deploy-zip.ps1 과 동일 관례:
#   - 소스 + node_modules + .next(빌드 결과)를 한 zip 에 담음 → 운영 PC 는 npm ci / build 불필요
#   - Compress-Archive 미사용 (대용량 폴더 불완전 zip 사고 방지) — .NET ZipFile 사용
#   - 자동 sanity check 로 .env 유출 / 빌드 누락 차단
#
# 사용:
#   .\scripts\build-deploy-zip.ps1 -Label v1
#   .\scripts\build-deploy-zip.ps1 -Label v1 -SkipBuild   # 이미 build:onprem 완료
#
# Output:
#   D:\meeting-bundle-<label>-<yyyy-MM-dd>\        (staging folder)
#   D:\meeting-bundle-<label>-<yyyy-MM-dd>.zip     (배포용 zip)
#
# ⚠ 빌드는 dev PC 의 .env(개발 DB)로 수행되지만 .env 는 절대 zip 에 포함되지 않는다.
#   운영 서버의 .env 는 운영자가 직접 작성 (.env.onprem.example 참조).
# ============================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Label,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Source root = repo root (이 script 가 scripts/ 아래에 있음)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Split-Path -Parent $scriptDir
$today = (Get-Date).ToString("yyyy-MM-dd")
$dst = "D:\meeting-bundle-$Label-$today"
$zipPath = "$dst.zip"

Write-Host ""
Write-Host "=== Meeting Deploy Zip Builder ===" -ForegroundColor Cyan
Write-Host "  Source:  $src"
Write-Host "  Staging: $dst"
Write-Host "  Zip:     $zipPath"
Write-Host ""

# ============================================================
# 0. Build (옵션) — build:onprem = prisma generate + next build (migrate 없음)
# ============================================================
if (-not $SkipBuild) {
    # dev 서버(next dev)가 떠 있으면 네이티브 모듈 잠김으로 npm ci 가 EPERM 실패 → 먼저 종료
    & "$scriptDir\kill-dev.ps1" -ProjectRoot $src

    Write-Host "[1/5] npm ci + npm run build:onprem ..." -ForegroundColor Yellow

    Push-Location $src
    try {
        & npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
        & npm run build:onprem
        if ($LASTEXITCODE -ne 0) { throw "build:onprem failed" }
    } finally {
        Pop-Location
    }

    Write-Host "  OK" -ForegroundColor Green
} else {
    Write-Host "[1/5] Skipping build (--SkipBuild)" -ForegroundColor DarkYellow
}

if (-not (Test-Path "$src\.next\BUILD_ID")) {
    throw ".next\BUILD_ID not found — build:onprem did not complete. Run without -SkipBuild."
}

# ============================================================
# 1. Staging folder 비우기
# ============================================================
Write-Host "[2/5] Preparing staging folder ..." -ForegroundColor Yellow
if (Test-Path $dst) {
    Remove-Item -Recurse -Force $dst
}
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}
New-Item -ItemType Directory -Path $dst | Out-Null
Write-Host "  OK" -ForegroundColor Green

# ============================================================
# 2. robocopy — 소스 복사 (node_modules / .next / .git / .claude / .env* 제외)
# ============================================================
Write-Host "[3/5] Copying source ..." -ForegroundColor Yellow

# robocopy 의 exit code 0~7 은 정상. 8+ 만 error.
$xdArgs = @(
    "node_modules",
    ".next",
    ".git",
    ".claude",
    "backups",
    "coverage"
)
# 비밀정보 메모 파일(*passwd*, *.txt 등)은 배포에 불필요 — 유출 방지 차원에서 함께 제외
& robocopy $src $dst /E /XD @xdArgs /XF ".env" ".env.*" "*passwd*" "*password*" "*.txt" /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed with exit $LASTEXITCODE"
}
Write-Host "  OK" -ForegroundColor Green

# ============================================================
# 3. node_modules + .next 별도 복사 (오프라인 운영 PC 용)
# ============================================================
Write-Host "[4/5] Copying node_modules + .next (for offline operation) ..." -ForegroundColor Yellow

& robocopy "$src\node_modules" "$dst\node_modules" /MIR /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "node_modules robocopy failed: $LASTEXITCODE" }

# .next\cache 는 빌드 캐시 (수백 MB, 런타임 불필요) — 제외
& robocopy "$src\.next" "$dst\.next" /MIR /XD "$src\.next\cache" /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw ".next robocopy failed: $LASTEXITCODE" }

Write-Host "  OK" -ForegroundColor Green

# ============================================================
# 4. Zip 생성
# ============================================================
Write-Host "[5/5] Compressing zip ..." -ForegroundColor Yellow
# ⚠ Compress-Archive 미사용 — 파일 수가 많으면 (node_modules ~수만 file) 메모리 부족으로
#   불완전한 zip 이 생길 수 있음 (PM M13 사고 사례). .NET ZipFile 은 streaming 이라 안정적.
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $dst, $zipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false)
$zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "  OK ($zipSize MB)" -ForegroundColor Green

# ============================================================
# 5. Sanity check (필수)
# ============================================================
Write-Host ""
Write-Host "=== Sanity check ===" -ForegroundColor Cyan
$pass = $true

$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entries = $zip.Entries.FullName | ForEach-Object { $_ -replace '\\', '/' }

    # 1) .next 빌드 결과 포함 (BUILD_ID)
    if ($entries -contains '.next/BUILD_ID') {
        Write-Host "  OK — .next\BUILD_ID included (build output present)" -ForegroundColor Green
    } else {
        Write-Host "  FAIL — .next\BUILD_ID missing (build output not bundled)" -ForegroundColor Red
        $pass = $false
    }

    # 2) node_modules 포함 (next 패키지 기준)
    if ($entries -contains 'node_modules/next/package.json') {
        Write-Host "  OK — node_modules included" -ForegroundColor Green
    } else {
        Write-Host "  FAIL — node_modules\next missing (offline bundle broken)" -ForegroundColor Red
        $pass = $false
    }

    # 3) prisma migrations 포함 (migrate deploy 용)
    $migCount = ($entries | Where-Object { $_ -like 'prisma/migrations/*/migration.sql' }).Count
    if ($migCount -ge 1) {
        Write-Host "  OK — prisma\migrations has $migCount migration(s)" -ForegroundColor Green
    } else {
        Write-Host "  FAIL — prisma\migrations empty (migrate deploy will do nothing)" -ForegroundColor Red
        $pass = $false
    }

    # 4) .env 가 포함 안 됨 (node_modules 내부의 라이브러리 샘플 .env 는 무해하므로 루트만 검사)
    $hasEnv = $entries | Where-Object { $_ -eq '.env' -or ($_ -like '.env.*' -and $_ -ne '.env.onprem.example') }
    if ($hasEnv) {
        Write-Host "  FAIL — .env leaked! ($($hasEnv -join ', '))" -ForegroundColor Red
        $pass = $false
    } else {
        Write-Host "  OK — .env excluded" -ForegroundColor Green
    }

    # 5) 루트에 비밀정보 의심 파일이 없는지 (passwd/secret 류 이름 또는 루트 .txt)
    #    — "Neon passwd for meeting room.txt" 가 번들에 섞여 들어갔던 실사고 재발 방지
    $rootSuspicious = $entries | Where-Object {
        ($_ -notmatch '/') -and ($_ -match '(?i)passwd|password|secret|credential|\.txt$')
    }
    if ($rootSuspicious) {
        Write-Host "  FAIL — suspicious root file(s) leaked: $($rootSuspicious -join ', ')" -ForegroundColor Red
        $pass = $false
    } else {
        Write-Host "  OK — no secret-looking files at bundle root" -ForegroundColor Green
    }

    # 6) .next\cache 제외 확인 (번들 크기 방어)
    $cacheEntries = ($entries | Where-Object { $_ -like '.next/cache/*' }).Count
    if ($cacheEntries -gt 0) {
        Write-Host "  FAIL — .next\cache leaked ($cacheEntries entries — bundle bloat)" -ForegroundColor Red
        $pass = $false
    } else {
        Write-Host "  OK — .next\cache excluded" -ForegroundColor Green
    }
} finally {
    $zip.Dispose()
}

Write-Host ""
if ($pass) {
    Write-Host "=== Bundle ready ===" -ForegroundColor Green
    Write-Host "  $zipPath ($zipSize MB)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next: copy this zip to operation PC and follow DEPLOY_USER_GUIDE_ONPREM.md" -ForegroundColor White
    # 명시적 exit 0 — 직전 robocopy 의 $LASTEXITCODE 가 남아 false failure 로 보고되는 것 방지.
    exit 0
} else {
    Write-Host "=== Sanity check FAILED ===" -ForegroundColor Red
    Write-Host "  Do NOT deploy this zip. Fix the issue and rebuild." -ForegroundColor Red
    exit 1
}
