# ============================================================
# Meeting Room 예약 — dev 서버 종료 (번들 생성 전 필수)
# ============================================================
# next dev(Turbopack)가 떠 있으면 node_modules 의 네이티브 모듈(.node)을 잠가
# npm ci 가 EPERM 으로 실패한다 (PM Tool kill-dev.ps1 과 동일한 이유).
# 본 script 는 이 저장소 경로를 참조하는 node.exe 프로세스만 골라 종료한다.
#
# build-deploy-zip.ps1 이 시작 시 자동 호출하므로 보통 직접 실행할 일은 없다.
# 수동 실행:
#   .\scripts\kill-dev.ps1
# ============================================================

[CmdletBinding()]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

$procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
         Where-Object { $_.CommandLine -and $_.CommandLine -like "*$ProjectRoot*" }

if (-not $procs) {
    Write-Host "[kill-dev] No node.exe processes referencing $ProjectRoot — nothing to do."
    exit 0
}

foreach ($p in $procs) {
    $cmdPreview = $p.CommandLine.Substring(0, [Math]::Min(100, $p.CommandLine.Length))
    Write-Host "[kill-dev] Stopping PID $($p.ProcessId): $cmdPreview ..."
    try {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
    } catch {
        Write-Warning "[kill-dev] Failed to stop PID $($p.ProcessId): $($_.Exception.Message)"
    }
}

# 파일 핸들이 실제로 풀릴 때까지 잠시 대기
Start-Sleep -Seconds 2
Write-Host "[kill-dev] Done."
exit 0
