## Takvim v2: visual upgrade + header link + PRO expandable detail
##
## Degisiklikler:
## - Visual upgrade (kalin baslik, importance dikey cubuk, kategori chip,
##   country pill, beklenti kutusu, gradient header)
## - Header tiklanir -> /takvim sayfasi (ChevronRight icon)
## - Item tiklanir -> expand (free: paywall, pro: 3 senaryo + asset impact +
##   watchlist + tarihsel context)
## - Data: TCMB/FOMC/CHP icin proAnalysis field eklendi
##
## Kullanim:
##   .\tools\hf-push-calendar-v2.ps1

$ErrorActionPreference = 'Stop'

Write-Host "==> Git lock temizleniyor..." -ForegroundColor Cyan
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

Write-Host "==> Stage'leme..." -ForegroundColor Cyan
git add src/data/curatedCalendar.ts
git add src/components/domain/EconomicCalendarWidget.tsx

git status --short

Write-Host ""
Write-Host "==> Commit..." -ForegroundColor Cyan
git commit -m "feat(calendar): visual upgrade + clickable header + PRO event detail

- Visual: importance vertical bar, gradient header, colored category/country
  pills, bolder titles, accent expectation boxes
- Header link -> /takvim full page (with hover chevron animation)
- Items expand on click -> PRO-gated detail panel showing:
  * 3 scenarios (bullish/base/bearish with colored borders)
  * Asset impact breakdown (BIST/USDTRY/Gold)
  * Watchlist of symbols to monitor
  * Historical context
- Free users see paywall CTA (Crown icon + 'PRO Ol' link)
- TCMB PPK, FED FOMC, CHP butlan: full proAnalysis data added"

if ($LASTEXITCODE -ne 0) { exit 0 }

$myCommit = (git log -1 --format=%H)
Write-Host "==> Commit: $myCommit" -ForegroundColor Green

Write-Host "==> Push..." -ForegroundColor Cyan
git push

if ($LASTEXITCODE -ne 0) {
    Write-Host "==> Cherry-pick recovery..." -ForegroundColor Yellow
    git fetch origin
    git reset --hard origin/main
    git cherry-pick $myCommit
    git push
}

Write-Host ""
Write-Host "==> Bitti. 2-3 dk sonra test:" -ForegroundColor Green
Write-Host "    /takvim full view" -ForegroundColor Cyan
Write-Host "    /panel sag rail -> baslik tikla, olay tikla (PRO icin detay)" -ForegroundColor Cyan
