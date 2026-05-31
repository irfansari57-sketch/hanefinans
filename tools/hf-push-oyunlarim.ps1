## Oyunlarim refactor + tum bekleyen degisikler bundled

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
git add src/features/predictions/PredictionsPage.tsx
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
    git commit -m "feat(games): Tahmin Oyunu -> Oyunlarim + 5 yeni oyun placeholder

Oyunlarim (Task #96):
- Layout nav: 'Tahmin Oyunu' -> 'Oyunlarim'
- /tahmin sayfa basligi 'Oyunlarim' + 'Tum Oyunlar' grid
- 6 oyun tile: Gunluk Tahmin (aktif), Bugunun Lideri, Sektor Sampiyonu,
  Finansal Quiz, Sembol Bulmaca, Sanal Portfoy (5 placeholder 'Yakinda')

Kompakt yerlesim (#95):
- 'Canli akis' badge header'dan kaldirildi
- Watchlist/Stocks/HeatMap: Yenile butonu kaldirildi (60sn auto var)

Watchlist pool format (#94):
- 6-kart Strong Buy/Fon Havuzu tarzi summary grid

Daily % fix (#92):
- snapshot.ts percent threshold + tefas history fallback

Bundled prior:
- Takip Listem nav, event reminders, mobile calendar, StrongBuy paywall
- /api/news EN temizleme, heat map endeks+sektor, recs accordion
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
Write-Host "==> Bitti. 2-3 dk sonra:" -ForegroundColor Green
Write-Host "    Sol menude 'Oyunlarim' (eski Tahmin Oyunu)" -ForegroundColor Cyan
Write-Host "    /tahmin sayfasi: 6 oyun grid (Gunluk Tahmin aktif, digerleri Yakinda)" -ForegroundColor Cyan
