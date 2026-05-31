## Bugunun Lideri MVP + tum bekleyen degisikler bundled

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

git add docs/GAMES_DESIGN.md
git add src/lib/dailyLeaderGame.ts
git add src/features/predictions/sections/LeaderGameCard.tsx
git add src/features/predictions/PredictionsPage.tsx
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
    git commit -m "feat(games): Bugunun Lideri MVP (client-side) + games design doc

Bugunun Lideri (Task #97):
- src/lib/dailyLeaderGame.ts: deterministic 5-symbol pick from BIST 30,
  date-seeded Mulberry32 PRNG, mode alternation (top/bottom)
- src/features/predictions/sections/LeaderGameCard.tsx: 5-stock grid UI,
  localStorage state, post-close auto-resolve via fetchIndexYahoo
- PredictionsPage 'Bugunun Lideri' tile activated + LeaderGameCard mount
- Scoring: correct = 50p, top-pick correct = +25 bonus, streak emoji
- History (30 day rolling), accuracy + total points stats

docs/GAMES_DESIGN.md:
- 5 oyun konsept (Bugunun Lideri, Sektor Sampiyonu, Quiz, Sembol Bulmaca, Sanal Portfoy)
- Mekanik + puanlama + backend/frontend + engagement + karmasiklik
- Onerilen oncelik sirasi

Bundled prior (#95, #96 + earlier):
- Oyunlarim nav rename + 6-tile grid
- Kompakt layout (Canli akis + Yenile kaldirildi)
- Watchlist 6-kart pool format + Takip Listem nav
- Daily % fix + event reminders + mobile calendar + StrongBuy paywall
- /api/news EN temizleme, heat map endeks+sektor, recs accordion
- Calendar v3 + collapsible + news net + TR sources + ticker controls"
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
Write-Host "    /tahmin -> 6 oyun grid (Gunluk Tahmin + Bugunun Lideri aktif)" -ForegroundColor Cyan
Write-Host "    Bugunun Lideri: 5 hisse, mode top/bottom, tahmin yap" -ForegroundColor Cyan
Write-Host "    Kapanis 18:10 sonrasi sayfayi acinca otomatik resolve" -ForegroundColor Cyan
