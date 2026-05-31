## Gunluk % fix (hisse + fon) + Takip Listem nav linki + bundled

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
    git commit -m "fix(daily%): snapshot percent-threshold + fund history fallback + nav

Daily change fix (Task #92):
- functions/api/yahoo/snapshot.ts: absolute 0.0001 threshold -> percent-based 0.001
  Weekend/holiday durumunda price == lastClose iken beforeClose'u baz alir
  -> son is gunu gercek degisimi gosterilir
- src/data/api/tefasGithub.ts: computeDayChangeFromHistory fallback
  Feed 1d eksik/0 ise history array'inden son 2 fiyatla hesaplanir

Nav (Task #93):
- Layout.tsx Piyasalar grubuna 'Takip Listem' (/watchlist) linki geri eklendi

Bundled prior:
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
Write-Host "==> Bitti. 2-3 dk sonra test:" -ForegroundColor Green
Write-Host "    1) /stocks, /recommendations Strong Buy, /funds -> Gun % gercek deger" -ForegroundColor Cyan
Write-Host "    2) Sol menude 'Takip Listem' geri geldi (/watchlist)" -ForegroundColor Cyan
Write-Host "    NOT: Yahoo snapshot D1 cache 5-10 dk gecmesi gerek (warmer worker tetik)" -ForegroundColor Yellow
