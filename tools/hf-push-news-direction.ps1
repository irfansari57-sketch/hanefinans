## Sag rail haber akisi yonu + TR finans kaynak filtresi + Panel mock skeleton
##
## Bu push tum bekleyen degisiklikleri toplu gonderir:
## - Panel skeleton fix (mock veri yerine localStorage cache + skeleton)
## - Calendar v3 (tipografi, turkuaz badge, default analiz)
## - News ticker direction toggle (asagidan yukari default)
## - GNews TR finans whitelist + investing.com blacklist
##
## Kullanim:
##   .\tools\hf-push-news-direction.ps1

$ErrorActionPreference = 'Stop'
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

# Tum degisen + yeni dosyalar
git add src/lib/usePersistedState.ts
git add src/features/panel/PanelPage.tsx
git add src/components/domain/EconomicCalendarWidget.tsx
git add src/data/curatedCalendar.ts
git add src/components/domain/RightNewsTicker.tsx
git add src/data/api/gnews.ts
git add src/index.css

git status --short

git commit -m "feat: panel skeleton + calendar v3 + news ticker direction + TR sources

Panel mock fix (Task #82):
- usePersistedState hook (localStorage cache, 30min TTL)
- macro/stocks/news init from cache (or empty -> skeleton)
- MarketSkeletonCard animated pulse, 3 sections covered
- Mock values (15.133, 6.890, 95000) never shown on first paint

Calendar v3 (Task #83):
- Softer header typography (slate-200 font-semibold)
- Turquoise date + time badges
- defaultAnalysis() per category, no 'hazirlik' message

News ticker direction (Task #85):
- Bottom-up scroll default (kullanici talebi)
- Header'da kucuk ArrowUp/Down toggle button
- localStorage'a kaydeder (fa.rightNews.direction)

GNews TR sources (Task #84):
- TR finans whitelist: BloombergHT, AA, Dunya, NTV, BBC TR, etc.
- Blacklist: investing.com, reuters.com, bloomberg.com, wsj, ft, cnbc
- Source name domain mapping (kisa label gosterilir)
- TR finans kaynagi importance boost
- looksTurkish() heuristic fallback"

if ($LASTEXITCODE -ne 0) { exit 0 }

$myCommit = (git log -1 --format=%H)
git push
if ($LASTEXITCODE -ne 0) {
    git fetch origin
    git reset --hard origin/main
    git cherry-pick $myCommit
    git push
}

Write-Host "==> Bitti. 2-3 dk sonra test:" -ForegroundColor Green
Write-Host "    1) /panel -> mock yok, cache hit veya skeleton" -ForegroundColor Cyan
Write-Host "    2) Sag rail haberler -> asagidan yukari kayma" -ForegroundColor Cyan
Write-Host "    3) Header'daki ArrowUp ikona tikla -> yonu degistir" -ForegroundColor Cyan
Write-Host "    4) Haberler artik BloombergHT, AA, Dunya gibi TR kaynaklardan" -ForegroundColor Cyan
Write-Host "    5) Investing.com EN haberleri artik gozukmez" -ForegroundColor Cyan
