## Watchlist pool format + daily % fix + Takip Listem nav + bundled

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

git add src/features/watchlist/WatchlistPage.tsx
git add functions/api/yahoo/snapshot.ts
git add src/data/api/tefasGithub.ts
git add src/app/Layout.tsx
git add src/lib/calendarReminders.ts
git add src/components/domain/EconomicCalendarWidget.tsx
git add src/features/panel/PanelPage.tsx
git add src/features/recommendations/sections/StrongBuyTab.tsx
git add functions/api/news/index.ts
git add src/components/domain/IndexHeatGrid.tsx
git add src/features/heatmap/HeatMapPage.tsx
git add src/features/recommendations/RecommendationsPage.tsx
git add src/components/domain/Ticker.tsx
git add src/components/domain/RightNewsTicker.tsx
git add src/data/api/gnews.ts
git add src/index.css
git add src/lib/usePersistedState.ts
git add src/data/curatedCalendar.ts

git status --short

if ((git status --porcelain) -ne $null) {
    git commit -m "feat(watchlist): pool format summary cards (5 donem) + bundled fixes

Watchlist refactor (Task #94):
- Eski 3 kart (Takipte / Yesil-Kirmizi / Ortalama) -> 6 kart yatay grid
- Strong Buy / Fon Havuzu tarzi pattern: Takipteki + 5 donem ortalama
- Her kart: avg %, up/down ratio, renkli ton

Bundled prior:
- Daily % snapshot percent threshold + tefas history fallback (#92)
- Takip Listem nav linki (#93)
- Event reminders + mobile calendar + StrongBuy paywall
- /api/news EN kaynak temizleme
- Heat map endeks + sektor
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
Write-Host "==> Bitti. 2-3 dk sonra:" -ForegroundColor Green
Write-Host "    /watchlist -> hisse tab'inda 6 ozet kart (Strong Buy formatinda)" -ForegroundColor Cyan
Write-Host "    Sol menude 'Takip Listem' geri" -ForegroundColor Cyan
Write-Host "    Gun % gercek deger (D1 cache 5-10dk)" -ForegroundColor Cyan
