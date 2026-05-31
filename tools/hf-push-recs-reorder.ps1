## Oneriler sayfa sirasi: Fon Havuzu -> Guclu Al -> Araci Kurum -> Model Portfoyler
## + Trend Fonlar accordion kaldirildi
## + Tum bekleyen calendar/news/ticker/panel degisikliklerini push'lar

$ErrorActionPreference = 'Stop'
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

# Bekleyen unpushed commit varsa cherry-pick recovery
$ahead = (git log origin/main..HEAD --oneline 2>$null)
if ($ahead) {
    Write-Host "==> Unpushed commit var. Cherry-pick recovery..." -ForegroundColor Yellow
    $myCommit = (git log -1 --format=%H)
    git fetch origin
    git reset --hard origin/main
    git cherry-pick $myCommit 2>&1
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

git add src/features/recommendations/RecommendationsPage.tsx
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
    git commit -m "feat(recs): reorder + remove Trend Fonlar + ticker controls + sidebar polish

Oneriler accordion sirasi:
1. Fon Havuzu (default acik)
2. Guclu Al Hisse Havuzu
3. Araci Kurum
4. Model Portfoyler
5. Algoritmik (en altta)
- Trend Fonlar tamamen kaldirildi (Fonlar sayfasinda mevcut)

Bundled:
- Price ticker (kayan fiyat bandi) JS-controlled prev/next/pause kontrolleri
- Sidebar economic calendar collapsible akordiyon
- News ticker mask kaldirildi -> haberler net
- GNews TR finance whitelist + EN blacklist
- News direction toggle
- Panel skeleton + localStorage cache
- Calendar v3 typography + default analiz"
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
Write-Host "    /recommendations -> sira: Fon Havuzu, Guclu Al, Araci Kurum, Model Portfoyler, Algoritmik" -ForegroundColor Cyan
Write-Host "    Trend Fonlar artik yok" -ForegroundColor Cyan
