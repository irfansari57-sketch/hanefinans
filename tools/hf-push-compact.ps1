## Kompakt yerlesim: Yenile + Canli akis kaldirildi + bundled

$ErrorActionPreference = 'Stop'
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

$ahead = git log origin/main..HEAD --oneline
if ($ahead) {
    Write-Host "==> Cherry-pick recovery..." -ForegroundColor Yellow
    $myCommit = (git log -1 --format=%H)
    git fetch origin
    git reset --hard origin/main
    git cherry-pick $myCommit
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

git add src/app/Layout.tsx
git add src/features/watchlist/WatchlistPage.tsx
git add src/features/stocks/StocksPage.tsx
git add src/features/heatmap/HeatMapPage.tsx
git add functions/api/yahoo/snapshot.ts
git add src/data/api/tefasGithub.ts
git add src/lib/calendarReminders.ts
git add src/components/domain/EconomicCalendarWidget.tsx
git add src/features/panel/PanelPage.tsx
git add src/features/recommendations/sections/StrongBuyTab.tsx
git add functions/api/news/index.ts
git add src/components/domain/IndexHeatGrid.tsx
git add src/features/recommendations/RecommendationsPage.tsx
git add src/components/domain/Ticker.tsx
git add src/components/domain/RightNewsTicker.tsx
git add src/data/api/gnews.ts
git add src/index.css
git add src/lib/usePersistedState.ts
git add src/data/curatedCalendar.ts

git status --short

if ((git status --porcelain) -ne $null) {
    git commit -m "fix(layout): kompakt yerlesim + bundled fixes

Kompakt (Task #95):
- Header'dan 'Canli akis' badge kaldirildi (yer kazanimi, kullanici talebi)
- Watchlist/Stocks/HeatMap PageHeader actions'tan Yenile butonu kaldirildi
  (60sn auto-refresh zaten var, manuel buton gereksiz)

Bundled:
- Watchlist 6-kart pool format (#94)
- Daily % fix snapshot + tefas history fallback (#92)
- Takip Listem nav (#93)
- Event reminders + mobile calendar + StrongBuy paywall
- /api/news EN kaynak temizleme
- Heat map endeks + sektor + sektor aggregate
- Recs accordion + reorder
- Calendar v3 + collapsible + news net + TR sources
- Price ticker controls + direction toggle + panel skeleton"
}

$myCommit = (git log -1 --format=%H)
git push
if ($LASTEXITCODE -ne 0) {
    git fetch origin
    git reset --hard origin/main
    git cherry-pick $myCommit
    git push
}

Write-Host ""
Write-Host "==> Bitti." -ForegroundColor Green
Write-Host "    Header'da artik 'Canli akis' yok" -ForegroundColor Cyan
Write-Host "    Sayfalardan Yenile butonu kaldirildi (auto 60sn)" -ForegroundColor Cyan
