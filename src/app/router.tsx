import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './Layout';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { RouteErrorBoundary } from '@/components/ui/RouteErrorBoundary';

/**
 * Cloudflare Pages'e yeni build deploy edilince eski tarayıcı index.html'i
 * eski chunk hash'lerini ister; bu chunk'lar artık 404 verir. Lazy import
 * hata yakalanır ve (oturumda 1 kez) sayfa otomatik yenilenir → fresh index.html.
 */
function lazyWithRetry<T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((err: Error) => {
      const msg = err?.message ?? '';
      const isChunkError =
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Importing a module script failed') ||
        msg.includes('error loading dynamically imported module');
      if (isChunkError && typeof window !== 'undefined') {
        const last = sessionStorage.getItem('fa.lastChunkReload');
        const now = Date.now();
        // 30 saniye debounce — sonsuz reload döngüsünü engelle
        if (!last || now - parseInt(last, 10) > 30_000) {
          sessionStorage.setItem('fa.lastChunkReload', String(now));
          window.location.reload();
          // Reload tetiklendi; geri dönüş yapma
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw err;
    }),
  );
}

// Route-level code splitting — her sayfa ayrı chunk
// İlk açılış JS bundle'ı ~%70 küçülür
const PanelPage             = lazyWithRetry(() => import('@/features/panel/PanelPage').then((m) => ({ default: m.PanelPage })));
const NewsPage              = lazyWithRetry(() => import('@/features/news/NewsPage').then((m) => ({ default: m.NewsPage })));
const WatchlistPage         = lazyWithRetry(() => import('@/features/watchlist/WatchlistPage').then((m) => ({ default: m.WatchlistPage })));
const FundsPage             = lazyWithRetry(() => import('@/features/funds/FundsPage').then((m) => ({ default: m.FundsPage })));
const StocksPage            = lazyWithRetry(() => import('@/features/stocks/StocksPage').then((m) => ({ default: m.StocksPage })));
const CommoditiesPage       = lazyWithRetry(() => import('@/features/commodities/CommoditiesPage').then((m) => ({ default: m.CommoditiesPage })));
const CryptoPage            = lazyWithRetry(() => import('@/features/crypto/CryptoPage').then((m) => ({ default: m.CryptoPage })));
const PortfolioPage         = lazyWithRetry(() => import('@/features/portfolio/PortfolioPage').then((m) => ({ default: m.PortfolioPage })));
const UsMarketsPage         = lazyWithRetry(() => import('@/features/usMarkets/UsMarketsPage').then((m) => ({ default: m.UsMarketsPage })));
const GlobalPage            = lazyWithRetry(() => import('@/features/global/GlobalPage').then((m) => ({ default: m.GlobalPage })));
const ForexPage             = lazyWithRetry(() => import('@/features/forex/ForexPage').then((m) => ({ default: m.ForexPage })));
const ForexDetailPage       = lazyWithRetry(() => import('@/features/forexDetail/ForexDetailPage').then((m) => ({ default: m.ForexDetailPage })));
const KvkkPage              = lazyWithRetry(() => import('@/features/legal/LegalPages').then((m) => ({ default: m.KvkkPage })));
const MesafeliPage          = lazyWithRetry(() => import('@/features/legal/LegalPages').then((m) => ({ default: m.MesafeliPage })));
const UyelikSozlesmesiPage  = lazyWithRetry(() => import('@/features/legal/LegalPages').then((m) => ({ default: m.UyelikSozlesmesiPage })));
const IadePolitikasiPage    = lazyWithRetry(() => import('@/features/legal/LegalPages').then((m) => ({ default: m.IadePolitikasiPage })));
const CerezPolitikasiPage   = lazyWithRetry(() => import('@/features/legal/LegalPages').then((m) => ({ default: m.CerezPolitikasiPage })));
const HeatMapPage           = lazyWithRetry(() => import('@/features/heatmap/HeatMapPage').then((m) => ({ default: m.HeatMapPage })));
const CommodityDetailPage   = lazyWithRetry(() => import('@/features/commodityDetail/CommodityDetailPage').then((m) => ({ default: m.CommodityDetailPage })));
const StockDetailPage       = lazyWithRetry(() => import('@/features/stockDetail/StockDetailPage').then((m) => ({ default: m.StockDetailPage })));
const FundDetailPage        = lazyWithRetry(() => import('@/features/fundDetail/FundDetailPage').then((m) => ({ default: m.FundDetailPage })));
const CryptoDetailPage      = lazyWithRetry(() => import('@/features/cryptoDetail/CryptoDetailPage').then((m) => ({ default: m.CryptoDetailPage })));
const MacroDetailPage       = lazyWithRetry(() => import('@/features/macroDetail/MacroDetailPage').then((m) => ({ default: m.MacroDetailPage })));
const HistoryPage           = lazyWithRetry(() => import('@/features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const MorningReportPage     = lazyWithRetry(() => import('@/features/morning/MorningReportPage').then((m) => ({ default: m.MorningReportPage })));
const RecommendationsPage   = lazyWithRetry(() => import('@/features/recommendations/RecommendationsPage').then((m) => ({ default: m.RecommendationsPage })));
const LoginPage             = lazyWithRetry(() => import('@/features/auth/AuthPage').then((m) => ({ default: m.LoginPage })));
const SignupPage            = lazyWithRetry(() => import('@/features/auth/AuthPage').then((m) => ({ default: m.SignupPage })));
const SmartSearchPage       = lazyWithRetry(() => import('@/features/smartSearch/SmartSearchPage').then((m) => ({ default: m.SmartSearchPage })));
const FinancialLiteracyPage = lazyWithRetry(() => import('@/features/literacy/FinancialLiteracyPage').then((m) => ({ default: m.FinancialLiteracyPage })));
const MembershipPage        = lazyWithRetry(() => import('@/features/membership/MembershipPage').then((m) => ({ default: m.MembershipPage })));
const SettingsPage          = lazyWithRetry(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AdBannerPreviewPage   = lazyWithRetry(() => import('@/features/preview/AdBannerPreviewPage').then((m) => ({ default: m.AdBannerPreviewPage })));

const withSuspense = (node: React.ReactNode) => (
  <Suspense fallback={<PageSkeleton />}>{node}</Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Navigate to="/panel" replace /> },
      { path: 'panel', element: withSuspense(<PanelPage />) },
      { path: 'morning', element: withSuspense(<MorningReportPage />) },
      { path: 'recommendations', element: withSuspense(<RecommendationsPage />) },
      { path: 'egitim', element: withSuspense(<FinancialLiteracyPage />) },
      { path: 'uyelik', element: withSuspense(<MembershipPage />) },
      { path: 'news', element: withSuspense(<NewsPage />) },
      { path: 'macro', element: <Navigate to="/morning" replace /> },
      { path: 'macro/:symbol', element: withSuspense(<MacroDetailPage />) },
      { path: 'watchlist', element: withSuspense(<WatchlistPage />) },
      { path: 'funds', element: withSuspense(<FundsPage />) },
      { path: 'stocks', element: withSuspense(<StocksPage />) },
      { path: 'emtia', element: withSuspense(<CommoditiesPage />) },
      { path: 'emtia/:symbol', element: withSuspense(<CommodityDetailPage />) },
      { path: 'kripto', element: withSuspense(<CryptoPage />) },
      { path: 'crypto/:symbol', element: withSuspense(<CryptoDetailPage />) },
      { path: 'kripto/:symbol', element: withSuspense(<CryptoDetailPage />) },
      { path: 'portfoy', element: withSuspense(<PortfolioPage />) },
      { path: 'abd', element: withSuspense(<UsMarketsPage />) },
      { path: 'global', element: withSuspense(<GlobalPage />) },
      { path: 'doviz', element: withSuspense(<ForexPage />) },
      { path: 'doviz/:symbol', element: withSuspense(<ForexDetailPage />) },
      { path: 'legal/kvkk', element: withSuspense(<KvkkPage />) },
      { path: 'legal/mesafeli-satis-sozlesmesi', element: withSuspense(<MesafeliPage />) },
      { path: 'legal/uyelik-sozlesmesi', element: withSuspense(<UyelikSozlesmesiPage />) },
      { path: 'legal/iade-politikasi', element: withSuspense(<IadePolitikasiPage />) },
      { path: 'legal/cerez-politikasi', element: withSuspense(<CerezPolitikasiPage />) },
      { path: 'heatmap', element: withSuspense(<HeatMapPage />) },
      { path: 'stock/:symbol', element: withSuspense(<StockDetailPage />) },
      { path: 'fund/:code', element: withSuspense(<FundDetailPage />) },
      { path: 'history', element: withSuspense(<HistoryPage />) },
      { path: 'smart-search', element: withSuspense(<SmartSearchPage />) },
      { path: 'settings', element: withSuspense(<SettingsPage />) },
      { path: 'preview/ad-banner', element: withSuspense(<AdBannerPreviewPage />) },
      { path: 'auth/login', element: withSuspense(<LoginPage />) },
      { path: 'auth/signup', element: withSuspense(<SignupPage />) },
      { path: '*', element: <Navigate to="/panel" replace /> },
    ],
  },
]);
