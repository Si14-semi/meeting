# ============================================================
# Meeting Room 예약 — NSSM service 제거
# ============================================================
# 실행 (관리자 PowerShell):
#   .\scripts\uninstall-service.ps1
# ============================================================

[CmdletBinding()]
param(
    [string]$ServiceName = "meeting-web"
)

$ErrorActionPreference = "Stop"

$nssmCmd = Get-Command nssm.exe -ErrorAction SilentlyContinue
if (-not $nssmCmd) {
    Write-Error "[uninstall-service] nssm.exe not found in PATH."
    exit 2
}

if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
    Write-Host "[uninstall-service] Service '$ServiceName' is not registered. Nothing to do."
    exit 0
}

Write-Host "[uninstall-service] Stopping '$ServiceName' (ignore error if already stopped)..."
& nssm stop $ServiceName 2>$null
Start-Sleep -Seconds 2

Write-Host "[uninstall-service] Removing '$ServiceName'..."
& nssm remove $ServiceName confirm
if ($LASTEXITCODE -ne 0) {
    Write-Error "[uninstall-service] nssm remove failed (exit $LASTEXITCODE)"
    exit 1
}

Write-Host "[uninstall-service] OK — service removed. (코드/DB 는 그대로 남아 있습니다)"
exit 0
