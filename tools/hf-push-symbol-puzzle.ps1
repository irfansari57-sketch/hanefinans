## Sembol Bulmaca + Bugunun Lideri MVP + bundled

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
git add src/lib/symbolPuzzleGame.ts
git add src/features/predictions/sections/LeaderGameCard.tsx
git add src/features/predictions/sections/SymbolPuzzleCard.tsx
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
    git commit -m "feat(games): Sembol Bulmaca + Bugunun Lideri MVP

Sembol Bulmaca (Task #98):
- src/lib/symbolPuzzleGame.ts: BIST_UNIQUE'ten date-seeded gunluk sirket sec
- 3 kademeli ipucu: sektor (free), ilk harf+uzunluk (-10p), isim baslangici (-20p)
- 3 deneme, puanlama 50/35/20
- TR karakter normalizasyonu (sembol/isim eslestirme)
- localStorage state

Bugunun Lideri (Task #97):
- BIST 30 deterministic 5-stock pick
- Mode top/bottom alternation
- Yahoo close auto-resolve (18:15+)

UI:
- 2 yeni Aktif tile (info + purple) Oyunlarim grid'inde
- LeaderGameCard + SymbolPuzzleCard mount edildi
- Autocomplete (BIST_UNIQUE), 3-attempt input, hint accordion

docs/GAMES_DESIGN.md: 5 oyun full konsept

Bundled prior:
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
Write-Host "==> Bitti. /tahmin -> 3 aktif oyun (Gunluk Tahmin, Bugunun Lideri, Sembol Bulmaca)" -ForegroundColor Green
