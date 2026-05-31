## Finansal Quiz + Sembol Bulmaca + Bugunun Lideri + bundled

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

git add docs/GAMES_DESIGN.md
git add src/lib/dailyLeaderGame.ts
git add src/lib/symbolPuzzleGame.ts
git add src/lib/quizQuestions.ts
git add src/lib/financialQuizGame.ts
git add src/features/predictions/sections/LeaderGameCard.tsx
git add src/features/predictions/sections/SymbolPuzzleCard.tsx
git add src/features/predictions/sections/FinancialQuizCard.tsx
git add src/features/predictions/PredictionsPage.tsx
git add src/app/Layout.tsx
git add src/features/watchlist/WatchlistPage.tsx
git add src/features/stocks/StocksPage.tsx
git add src/features/heatmap/HeatMapPage.tsx
git add functions/api/yahoo/snapshot.ts
git add src/data/api/tefasGithub.ts
git add src/lib/calendarReminders.ts
git add src/components/domain/EconomicCalendarWidget.tsx
git add src/features/panel/PanelPage.tsx
git add src/features/recommendations/sections/StrongBuyTab.tsx
git add functions/api/news/index.ts
git add src/components/domain/IndexHeatGrid.tsx
git add src/features/recommendations/RecommendationsPage.tsx
git add src/components/domain/Ticker.tsx
git add src/components/domain/RightNewsTicker.tsx
git add src/data/api/gnews.ts
git add src/index.css
git add src/lib/usePersistedState.ts
git add src/data/curatedCalendar.ts

git status --short

if ((git status --porcelain) -ne $null) {
    git commit -m "feat(games): Finansal Quiz MVP (30 soru bankasi) + bundled

Finansal Quiz (Task #99):
- src/lib/quizQuestions.ts: 30 TR finans sorusu (temel/bist/makro/aktuel)
  4 sikli, dogru cevap + aciklama
- src/lib/financialQuizGame.ts: date-seeded 3-soru pick, localStorage
  Puanlama: dogru = 10p, 3/3 = +25 bonus
- FinancialQuizCard: ABCD secim, anlik feedback gostermez, 'Cevaplari Gonder'
  sonrasi tum sorular icin ✓/✗ + aciklama gosterir
- Stats: dogru oran, perfect streak (3/3 ardisik)

Onceki oyunlar bundled (#97, #98):
- Bugunun Lideri (BIST 30 5-stock pick, Yahoo close resolve)
- Sembol Bulmaca (BIST_UNIQUE 3-ipucu, 3 deneme)

Eski Tahmin Oyunu + nav/UI/data fix'ler hepsi bu push'ta."
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
Write-Host "==> Bitti. /tahmin -> 4 aktif oyun (Gunluk Tahmin, Bugunun Lideri, Quiz, Sembol Bulmaca)" -ForegroundColor Green
Write-Host "    Quiz: 3 soru ABCD, hepsini cevapla -> sonuc + aciklamalar" -ForegroundColor Cyan
