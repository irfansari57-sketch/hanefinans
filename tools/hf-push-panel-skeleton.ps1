## Panel mock veri -> localStorage cache + skeleton fix
##
## Degisiklikler:
## - YENI: src/lib/usePersistedState.ts — generic localStorage cache hook
## - PanelPage: macro/stocks/news initial state mock yerine cache veya bos
## - PanelPage: BIST/USD-EUR/Altin&Gumus/Kripto bolumlerinde macro empty ise
##   animated skeleton card gosterilir (3 grid). Mock degerler (15.133, 6.890,
##   95000) artik asla baslangicta gozukmez.
## - Eski kullaniciya cache hit ile son bilinen GERCEK veri gozukur (1-2sn
##   sonra refresh). Yeni kullanici skeleton -> gercek veri smooth gecis.
##
## Kullanim:
##   .\tools\hf-push-panel-skeleton.ps1

$ErrorActionPreference = 'Stop'
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

git add src/lib/usePersistedState.ts
git add src/features/panel/PanelPage.tsx
git add src/components/domain/EconomicCalendarWidget.tsx
git add src/data/curatedCalendar.ts

git status --short

git commit -m "fix(panel): replace mock fallback with localStorage cache + skeleton

- New usePersistedState hook: hydrate state from localStorage (30min TTL),
  auto-persist on update. Returns [value, setValue, isCached] tuple.
- PanelPage: macro/stocks/news no longer init with MOCK_*; uses cached
  prior values or empty array (which triggers skeleton).
- Added MarketSkeletonCard/MarketSkeletonGrid: animated pulse placeholders.
- BIST/Forex/Gold/Crypto sections show 4 skeleton cards when macro empty.
- Returning users see last-known real data instantly (cache hit).
- New users see skeleton; smooth transition when API resolves.
- Mock values (15.133, 6.890, 95000, etc.) NEVER appear on first paint.

Also bundles calendar v3 changes:
- Softer header typography (slate-200 font-semibold)
- Turquoise date/time badges
- defaultAnalysis() for each event category (no more 'hazirlik' message)"

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
Write-Host "    1) Yeni tarayici sekmesi (cache temiz) -> /panel -> skeleton karelar gorunmeli, mock yok" -ForegroundColor Cyan
Write-Host "    2) Mevcut sekme -> cache hit -> son gercek veriler aninda" -ForegroundColor Cyan
Write-Host "    3) /takvim -> tum olaylara tikla -> PRO analiz var" -ForegroundColor Cyan
