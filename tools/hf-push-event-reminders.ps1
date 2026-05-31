## Event reminders + mobile calendar + StrongBuy paywall + bundled tum bekleyenler

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

git add src/lib/calendarReminders.ts
git add src/components/domain/EconomicCalendarWidget.tsx
git add src/app/Layout.tsx
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
    git commit -m "feat(calendar): event reminders + mobile placement + bundled changes

Event reminders (Task #90):
- New calendarReminders.ts: localStorage + Notification API
- EventReminderButton in expanded calendar item: '1 saat once hatirlat'
- Layout tick interval (60sn) -> trigger zamani gelenleri fire eder

Mobile calendar (Task #91):
- PanelPage'de agent kartlardan once lg:hidden EconomicCalendarWidget
- Compact + collapsible akordiyon variant

Bundled prior:
- StrongBuy 5 hisse free preview + PRO unlock (Task #78)
- /api/news EN kaynak temizleme (Task #89)
- Heat map endeks + sektor (Task #80)
- Recs accordion + reorder (Task #86)
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
Write-Host "    1) Mobil /panel -> agent kartlarinin ustunde akordiyon takvim" -ForegroundColor Cyan
Write-Host "    2) Takvim event'ine tikla -> en altta '1 saat once hatirlat' butonu" -ForegroundColor Cyan
Write-Host "    3) Bildirim izni iste -> kabul -> hatirlatici aktif" -ForegroundColor Cyan
Write-Host "    4) Tetik zamani geldiginde tarayici acikken Notification gelir" -ForegroundColor Cyan
