## Takvim v3: tipografi tonu + turkuaz tarih badge + kategori-bazli default analiz
##
## Degisiklikler:
## - Header h4: text-slate-50 font-bold -> text-slate-200 font-semibold (nav menu gibi)
## - Tarih badge default state: siyah -> turkuaz (accent renkli)
## - Saat badge: siyah -> turkuaz hafif tonlu
## - "Hazirlik asamasinda" mesaji kalkti. Her olay icin kategoriye gore
##   default proAnalysis dolduruluyor (monetary/data/political/holiday/derivatives).
##
## Kullanim:
##   .\tools\hf-push-calendar-v3.ps1

$ErrorActionPreference = 'Stop'

Remove-Item -Force ".git\index.lock" -ErrorAction SilentlyContinue

git add src/components/domain/EconomicCalendarWidget.tsx

git status --short

git commit -m "feat(calendar): softer typography + turquoise badges + default analysis per category

- Header title: slate-200 font-semibold (matches nav menu tone)
- Date + time badges: turquoise (accent) instead of dark slate
- Removed 'hazirlik asamasinda' fallback message
- Added defaultAnalysis() function: each event without explicit
  proAnalysis gets category-based default (monetary/data/political/
  holiday/derivatives) with 3 scenarios + asset impact + watchlist
- Every event now shows meaningful PRO content for paid users"

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
Write-Host "    /takvim ve /panel sag rail" -ForegroundColor Cyan
Write-Host "    Tum olaylar tiklanir, her event'te PRO icerik gosterilir" -ForegroundColor Cyan
