## Oneriler sayfasi: tabs -> PinnableAccordion + tum bekleyen calendar/news fix
##
## Bu push toplu — onceki bekleyen commit'ler birlikte gider:
## - Recommendations page tab buttons -> 6 PinnableAccordion section
## - Calendar accordion (sag rail collapsible)
## - News blur fix
## - GNews TR sources whitelist
## - Direction toggle
## - Panel skeleton + cache

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
    if ($LASTEXITCODE -ne 0) {
        Write-Host "==> Cherry-pick conflict. Manuel cozum gerek." -ForegroundColor Red
        exit 1
    }
}

# Yeni degisiklikleri stage
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
    git commit -m "feat(recs+sidebar): accordion sections + calendar collapsible + news net

Oneriler page (Task #86):
- Tab buttons kaldirildi -> 6 PinnableAccordion section
- Default: Fon Havuzu acik, digerleri kapali (yer kazanci)
- Kullanici hangi section'i istiyorsa acar, pin'leyebilir

Sidebar (Task #87):
- EconomicCalendarWidget collapsible prop -> sag rail default kapali akordiyon
- News ticker mask kaldirildi -> haberler net (blur yok)

Bundled from prior commits (panel skeleton, TR news, direction toggle, calendar v3)."
}

$myCommit = (git log -1 --format=%H)
Write-Host "==> Push: $myCommit" -ForegroundColor Cyan
git push

if ($LASTEXITCODE -ne 0) {
    Write-Host "==> Cherry-pick recovery..." -ForegroundColor Yellow
    git fetch origin
    git reset --hard origin/main
    git cherry-pick $myCommit
    git push
}

Write-Host ""
Write-Host "==> Bitti. 2-3 dk sonra test:" -ForegroundColor Green
Write-Host "    1) /recommendations sayfasi -> 6 accordion section" -ForegroundColor Cyan
Write-Host "    2) Default: Fon Havuzu acik, digerleri kapali" -ForegroundColor Cyan
Write-Host "    3) Sag rail takvim kapali, basliga tikla -> ac" -ForegroundColor Cyan
Write-Host "    4) Haberler net (blur yok)" -ForegroundColor Cyan
