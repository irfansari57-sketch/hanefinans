## Price ticker controls + tum bekleyen calendar/news/recs degisikliklerini push'lar
##
## Yeni: Kayan fiyat bandina prev/next/pause kontrolleri
## Bundled: Recommendations accordion, calendar collapsible, news net,
##          TR sources, direction toggle, panel skeleton

$ErrorActionPreference = 'Stop'
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

# Bekleyen unpushed varsa cherry-pick
$ahead = (git log origin/main..HEAD --oneline 2>$null)
if ($ahead) {
    Write-Host "==> Unpushed commit var. Cherry-pick recovery..." -ForegroundColor Yellow
    $myCommit = (git log -1 --format=%H)
    git fetch origin
    git reset --hard origin/main
    git cherry-pick $myCommit 2>&1
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

# Yeni dosyalari stage
git add src/components/domain/Ticker.tsx
git add src/features/recommendations/RecommendationsPage.tsx
git add src/components/domain/EconomicCalendarWidget.tsx
git add src/components/domain/RightNewsTicker.tsx
git add src/data/api/gnews.ts
git add src/index.css
git add src/features/panel/PanelPage.tsx 2>$null
git add src/lib/usePersistedState.ts 2>$null
git add src/data/curatedCalendar.ts 2>$null

git status --short

if ((git status --porcelain) -ne $null) {
    git commit -m "feat: ticker controls + accordion sections + sidebar polish

Ticker controls (Task #88):
- Price ticker (kayan fiyat bandi) JS-controlled scroll
- Prev/Next/Pause butonlari (sag taraf, BreakingNews ile ayni)
- Hover'da durur, manuel kontrol
- requestAnimationFrame 60fps + translate3d

Bundled prior:
- Oneriler tabs -> 6 PinnableAccordion (Task #86)
- Sidebar calendar collapsible (Task #87)
- News ticker mask kaldirildi -> haberler net
- GNews TR finance whitelist + EN blacklist
- News direction toggle
- Panel skeleton + localStorage cache
- Calendar v3 (typography + default analiz)"
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
Write-Host "    1) Fiyat bandinda sag taraf <  || > butonlari" -ForegroundColor Cyan
Write-Host "    2) Pause -> akis durur, tekrar tikla -> Play, devam eder" -ForegroundColor Cyan
Write-Host "    3) Prev/Next ile 1 hisse mesafesi ileri/geri kaydir" -ForegroundColor Cyan
Write-Host "    4) Hover'da otomatik durur" -ForegroundColor Cyan
