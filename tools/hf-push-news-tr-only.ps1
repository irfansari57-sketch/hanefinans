## Backend /api/news: EN kaynak temizleme + heat map + ticker bundled push

$ErrorActionPreference = 'Stop'
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

$ahead = (git log origin/main..HEAD --oneline 2>$null)
if ($ahead) {
    Write-Host "==> Cherry-pick recovery..." -ForegroundColor Yellow
    $myCommit = (git log -1 --format=%H)
    git fetch origin
    git reset --hard origin/main
    git cherry-pick $myCommit 2>&1
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

git add functions/api/news/index.ts
git add src/components/domain/IndexHeatGrid.tsx 2>$null
git add src/features/heatmap/HeatMapPage.tsx 2>$null
git add src/features/recommendations/RecommendationsPage.tsx 2>$null
git add src/components/domain/Ticker.tsx 2>$null
git add src/components/domain/EconomicCalendarWidget.tsx 2>$null
git add src/components/domain/RightNewsTicker.tsx 2>$null
git add src/data/api/gnews.ts 2>$null
git add src/index.css 2>$null
git add src/features/panel/PanelPage.tsx 2>$null
git add src/lib/usePersistedState.ts 2>$null
git add src/data/curatedCalendar.ts 2>$null

git status --short

if ((git status --porcelain) -ne $null) {
    git commit -m "fix(news): TR-only sources (remove Investing/Reuters/FT) + bundled changes

Backend /api/news (Task #89):
- SOURCES'tan Investing.com, Investing FX, Investing Emtia, Reuters, FT KALDIRILDI
- Yeni TR: Milliyet, Sozcu eklendi
- Extra defense: BLOCKED_DOMAINS + isTurkishText filter onRequestGet'te
- 30+ karakterli baslik TR-karakter veya TR-keyword icermiyorsa elenir

Bundled prior:
- Heat Map: Endeks (ana + sektor) + Sektorel Aggregate (Task #80)
- Recs accordion sirasi + Trend Fonlar kaldirildi
- Price ticker prev/next/pause
- Sidebar calendar collapsible + news blur fix
- GNews TR whitelist + direction toggle
- Panel skeleton + cache + calendar v3"
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
Write-Host "==> Bitti. Cache TTL nedeniyle EN haberler tamamen kaybolmasi 5-10 dk surebilir." -ForegroundColor Cyan
Write-Host "    Hizli test: tarayicinizdan haber API'sini direk cagirin: https://hanefinans.net/api/news?max=20" -ForegroundColor Cyan
