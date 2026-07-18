# Hane Finans — BIST Yahoo proxy override fix push script
# Çalıştırmak için: PowerShell aç → bu klasöre cd → .\push-bist-fix.ps1
# Veya: dosyaya sağ tıkla → "Run with PowerShell"

$ErrorActionPreference = 'Continue'

Write-Host ""
Write-Host "=== Hane Finans BIST fix push ===" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

# 1. Lock varsa sil
if (Test-Path .git\index.lock) {
    Write-Host "→ .git\index.lock siliniyor..." -ForegroundColor Yellow
    Remove-Item .git\index.lock -Force
}

# 2. TANI: hangi dosyalar modified?
Write-Host ""
Write-Host "=== git diff --name-only ===" -ForegroundColor Cyan
git diff --name-only
Write-Host ""

# 3. Literal pathspec ile [[path]].ts'yi ekle
$env:GIT_LITERAL_PATHSPECS = "1"

$targetFile = 'functions/api/yahoo/[[path]].ts'
Write-Host "→ Stage ediliyor: $targetFile" -ForegroundColor Yellow
git add $targetFile

# 4. Stage durumu
Write-Host ""
Write-Host "=== git status --short (stage sonrasi) ===" -ForegroundColor Cyan
git status --short
Write-Host ""

# 5. Stage edildi mi kontrol et
$staged = git diff --cached --name-only
if ($staged -notcontains 'functions/api/yahoo/[[path]].ts') {
    Write-Host "HATA: Dosya stage EDILMEDI." -ForegroundColor Red
    Write-Host ""
    Write-Host "Dogrulama: dosya gercekten var mi?" -ForegroundColor Yellow
    Test-Path 'functions/api/yahoo/[[path]].ts'
    Write-Host ""
    Write-Host "Manuel fallback: git add -A functions/api/yahoo/" -ForegroundColor Yellow
    git add -A functions/api/yahoo/
    git status --short
    Write-Host ""
    Read-Host "Enter ile devam et"
}

# 6. Commit
Write-Host "→ Commit yapiliyor..." -ForegroundColor Yellow
git commit -m "fix(bist): Yahoo proxy XU100/XU030 icin Is Yatirim override (kalici cozum)"

# 7. Push
Write-Host ""
Write-Host "→ Push yapiliyor..." -ForegroundColor Yellow
git push origin main

Write-Host ""
Write-Host "=== Tamamlandi ===" -ForegroundColor Green
Write-Host "Cloudflare Pages dashboard'da yeni commit deploy ediliyor olmali." -ForegroundColor Cyan
Write-Host ""

Remove-Item env:\GIT_LITERAL_PATHSPECS -ErrorAction SilentlyContinue

Read-Host "Cikmak icin Enter"
