## StrongBuy paywall: 5 hisse preview + PRO icin kalani
## Bundled: backend EN news removal + sidebar fix + heat map + ticker controls

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

git add src/features/recommendations/sections/StrongBuyTab.tsx
git add functions/api/news/index.ts
git add src/components/domain/IndexHeatGrid.tsx
git add src/features/heatmap/HeatMapPage.tsx
git add src/features/recommendations/RecommendationsPage.tsx
git add src/components/domain/Ticker.tsx
git add src/components/domain/EconomicCalendarWidget.tsx
git add src/components/domain/RightNewsTicker.tsx
git add src/data/api/gnews.ts
git add src/index.css
git add src/features/panel/PanelPage.tsx
git add src/lib/usePersistedState.ts
git add src/data/curatedCalendar.ts

git status --short

if ((git status --porcelain) -ne $null) {
    git commit -m "feat(strongbuy): 5-stock free preview + PRO unlock + bundled news fix

StrongBuy paywall (Task #78):
- Free user: pool.slice(0, 5) gosterilir
- PRO/Elite: tam pool (25 hisse)
- Locked count > 0 ise altinda warning card + 'PRO Ol' CTA

Bundled:
- /api/news EN kaynak temizleme (Investing/Reuters/FT)
- Heat map endeks + sektor aggregate
- Recs accordion + Trend Fonlar kaldirildi
- Price ticker prev/next/pause
- Sidebar calendar collapsible + news net + TR sources
- Direction toggle + panel skeleton + calendar v3"
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
Write-Host "==> Bitti. /recommendations -> Guclu Al havuzu accordion'unu ac" -ForegroundColor Green
Write-Host "    Free hesap acanlar 5 hisse + PRO Ol uyarisi gorecek" -ForegroundColor Cyan
Write-Host "    Elite hesabinla tam 25 hisse gozukur" -ForegroundColor Cyan
