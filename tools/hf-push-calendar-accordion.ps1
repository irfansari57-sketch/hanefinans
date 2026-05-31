## Calendar akordiyon + news net + (onceki) panel skeleton + TR sources + direction
##
## Bu push toplu — onceki commit henuz cherry-pick edilmemis olabilir,
## o yuzden cherry-pick recovery yapilir.
##
## Yeni degisiklikler:
## - Sag rail calendar widget: collapsible akordiyon (default kapali)
## - News ticker mask blur kaldirildi (haberler net gosterilir)
##
## Onceki commit'lerden kalan:
## - Panel skeleton (cache + skeleton card)
## - Calendar v3 (default analysis per category)
## - News direction toggle
## - GNews TR finance whitelist + EN blacklist

$ErrorActionPreference = 'Stop'
Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

# Eger onceki commit local'de bekliyor ise (push reddedildi) — cherry-pick recovery
$ahead = (git log origin/main..HEAD --oneline)
if ($ahead) {
    Write-Host "==> Local'de pushlanmamis commit var. Cherry-pick recovery..." -ForegroundColor Yellow
    $myCommit = (git log -1 --format=%H)
    git fetch origin
    git reset --hard origin/main
    git cherry-pick $myCommit 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "==> Cherry-pick conflict. Manuel cozum:" -ForegroundColor Red
        Write-Host "    git status -> conflict dosyalari" -ForegroundColor Yellow
        Write-Host "    Cozulduktan sonra: git add . && git cherry-pick --continue && git push" -ForegroundColor Yellow
        exit 1
    }
}

# Yeni degisiklikleri stage'le
git add src/components/domain/EconomicCalendarWidget.tsx
git add src/components/domain/RightNewsTicker.tsx
git add src/data/api/gnews.ts
git add src/index.css
# (Panel + curatedCalendar + usePersistedState onceden commit'te varsa pas)
git add src/features/panel/PanelPage.tsx 2>$null
git add src/lib/usePersistedState.ts 2>$null
git add src/data/curatedCalendar.ts 2>$null

git status --short

if ((git status --porcelain) -ne $null) {
    git commit -m "feat(sidebar): calendar accordion + news net (no blur mask)

- EconomicCalendarWidget: collapsible prop (akordiyon davranisi)
  Sag rail'de default kapali, header tikla ac/kapat, localStorage'a kayit
- News ticker mask-image kaldirildi -> haberler net gosterilir, blur yok
- Onceki bekleyen: panel skeleton, TR news whitelist, direction toggle"
}

$myCommit = (git log -1 --format=%H)
Write-Host "==> Push: $myCommit" -ForegroundColor Cyan
git push

if ($LASTEXITCODE -ne 0) {
    Write-Host "==> Push reddedildi. Cherry-pick recovery..." -ForegroundColor Yellow
    git fetch origin
    git reset --hard origin/main
    git cherry-pick $myCommit
    git push
}

Write-Host ""
Write-Host "==> Bitti. 2-3 dk sonra test:" -ForegroundColor Green
Write-Host "    1) Sag rail'de Ekonomik Takvim kapali geliyor -> baslik tikla -> acilir" -ForegroundColor Cyan
Write-Host "    2) Haberler net (blur yok)" -ForegroundColor Cyan
Write-Host "    3) BloombergHT, AA, Dunya vb. TR kaynaklar" -ForegroundColor Cyan
Write-Host "    4) Haberler asagidan yukari kayar, ArrowUp ikon ile yon degisir" -ForegroundColor Cyan
Write-Host "    5) /panel mock yok, cache veya skeleton" -ForegroundColor Cyan
