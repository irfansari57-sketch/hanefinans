# hf-push.ps1 -- HaneFinans tek-komut git push helper
# Kullanim: .\tools\hf-push.ps1 "commit mesaji"

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Message
)

$ErrorActionPreference = 'Continue'

# Script'in oldugu yerden repo root'a cik (tools/ -> ..)
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $repoRoot) { $repoRoot = (Get-Location).Path }
Set-Location $repoRoot

Write-Host ""
Write-Host "[REPO] $repoRoot" -ForegroundColor Cyan

# Stale git lock dosyalarini temizle
Remove-Item -Force -ErrorAction SilentlyContinue ".git\index.lock"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue ".git\rebase-merge"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue ".git\rebase-apply"

# Tum degisiklikleri stage et
& git add -A

# Degisiklik var mi?
$status = & git status --porcelain
if (-not $status) {
    Write-Host "[UYARI] Stage edilecek degisiklik yok. Push iptal." -ForegroundColor Yellow
    exit 0
}

$count = ($status | Measure-Object).Count
Write-Host "[STAGE] $count dosya staged" -ForegroundColor Cyan

# Commit
Write-Host "[COMMIT] $Message" -ForegroundColor Cyan
& git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "[HATA] Commit basarisiz (kod $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

# Pull (merge stratejisi -- rebase yok)
Write-Host "[PULL] Origin'den cekiliyor..." -ForegroundColor Cyan
& git pull --no-rebase --no-edit
if ($LASTEXITCODE -ne 0) {
    Write-Host "[HATA] Pull cakismasi -- manuel cozmen gerek. git status'a bak." -ForegroundColor Red
    exit $LASTEXITCODE
}

# Push
Write-Host "[PUSH] Pushing..." -ForegroundColor Cyan
& git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "[HATA] Push basarisiz (kod $LASTEXITCODE)" -ForegroundColor Red
    Write-Host "       Tek tekrar dene: git push" -ForegroundColor Yellow
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "[OK] Push tamamlandi. Cloudflare deploy ~3 dk baslar." -ForegroundColor Green
Write-Host ""
& git log --oneline -3 | Out-Host
