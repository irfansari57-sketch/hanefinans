## Heat Map: Endeks + Sektorel aggregate + bundled tum bekleyen degisiklikler

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

# YENI heat map dosyalari
git add src/components/domain/IndexHeatGrid.tsx
git add src/features/heatmap/HeatMapPage.tsx
# Diger bekleyen (recs + ticker + sidebar)
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
    git commit -m "feat(heatmap): index + sector aggregate heat map

Heat Map (Task #80):
- New IndexHeatGrid component: BIST 100/30/50/100-30 + 16 sektor endeksi
  (XBANK, XHOLD, XSANI, XGIDA, XTRZM, XELKT, XILTM, vb.)
  Yahoo'dan canli veri, renk yogunlugu, 60sn auto-refresh
- SectorBlock refactor: hisse grid kaldirildi, aggregate kart (sektor ortalamasi
  + arti/eksi sayisi + en iyi/en kotu hisse, renk yogunluklu)
- Sayfa yapisi: Endeks Heat Map (ana + sektor) -> Sektorel Performans (hisse bazli)

Bundled:
- Recs reorder + Trend Fonlar kaldirildi
- Price ticker prev/next/pause
- Sidebar calendar collapsible
- News blur fix + TR sources + direction toggle
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
Write-Host "==> Bitti. 2-3 dk sonra test:" -ForegroundColor Green
Write-Host "    /heatmap -> Ana Endeksler (BIST 100/30/50) + Sektor Endeksleri (XBANK, XHOLD, vb.)" -ForegroundColor Cyan
Write-Host "    Altinda Sektorel Performans aggregate kartlar (en iyi/en kotu hisse)" -ForegroundColor Cyan
