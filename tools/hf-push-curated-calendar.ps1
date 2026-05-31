## Kurate edilmis ekonomik takvim — TradingView yerine TR-odakli olay listesi
##
## Degisiklikler:
## - YENI: src/data/curatedCalendar.ts (20 olay, Haz-Tem 2026)
## - REPLACE: src/components/domain/EconomicCalendarWidget.tsx (TradingView -> kurate)
## - REPLACE: src/features/calendar/EconomicCalendarPage.tsx
## - UPDATE: src/components/domain/RightNewsTicker.tsx (sag rail'e kompakt strip)
##
## Onceki bekleyen "fix(calendar): TradingView widget" commit'i bu degisiklikle
## supersede oldugu icin drop edilecek.
##
## Kullanim:
##   .\tools\hf-push-curated-calendar.ps1

$ErrorActionPreference = 'Stop'

Write-Host "==> Git lock temizleniyor..." -ForegroundColor Cyan
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

Write-Host "==> Bekleyen unpushed commit'i drop et (TradingView fix iptal, yerine kurate icerik geliyor)..." -ForegroundColor Cyan
git fetch origin
git reset --mixed origin/main

Write-Host ""
Write-Host "==> Stage'leme: 4 dosya..." -ForegroundColor Cyan
git add src/data/curatedCalendar.ts
git add src/components/domain/EconomicCalendarWidget.tsx
git add src/features/calendar/EconomicCalendarPage.tsx
git add src/components/domain/RightNewsTicker.tsx

git status --short

Write-Host ""
Write-Host "==> Commit..." -ForegroundColor Cyan
git commit -m "feat(calendar): TR-focused curated calendar replaces TradingView embed

- New curated event data (20 events Jun-Jul 2026): TCMB PPK, FED FOMC,
  ECB, TUFE, NFP, GSYIH, BIST holidays, VIOP expiries, TR politics
- New EconomicCalendarWidget renders curated list with importance dots,
  category labels, impact icons, country flags
- Mounted in right rail (below AdVideo, above news ticker) as compact
  strip showing next 5 high-impact events for 14 days
- Full calendar view at /takvim shows 50 events / 60 days

Curated content rationale: TradingView feed lacks TR-specific items
(CHP butlan, BIST holidays, VIOP expiries, local political events)."

if ($LASTEXITCODE -ne 0) { exit 0 }

$myCommit = (git log -1 --format=%H)
Write-Host "==> Commit: $myCommit" -ForegroundColor Green

Write-Host ""
Write-Host "==> Push..." -ForegroundColor Cyan
git push

if ($LASTEXITCODE -ne 0) {
    Write-Host "==> Push reddedildi (cron commit?). Cherry-pick recovery..." -ForegroundColor Yellow
    git fetch origin
    git reset --hard origin/main
    git cherry-pick $myCommit
    git push
}

Write-Host ""
Write-Host "==> Bitti. 2-3 dk sonra Cloudflare deploy edecek." -ForegroundColor Green
Write-Host "==> Test:" -ForegroundColor Cyan
Write-Host "    1) https://hanefinans.net/takvim  (full view)" -ForegroundColor Cyan
Write-Host "    2) https://hanefinans.net/panel   (sag rail'de mini strip)" -ForegroundColor Cyan
Write-Host "    3) Ctrl+Shift+R ile cache temizle" -ForegroundColor Cyan
