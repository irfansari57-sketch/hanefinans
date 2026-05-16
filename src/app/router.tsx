import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './Layout';
import { PageSkeleton } from '@/components/ui/Skeleton';

// Route-level code splitting — her sayfa ayrı chunk
// İlk açılış JS bundle'ı ~%70 küçülür
const PanelPage             = lazy(() => import('@/features/panel/PanelPage').then((m) => ({ default: m.PanelPage })));
const NewsPage              = lazy(() => import('@/features/news/NewsPage').then((m) => ({ default: m.NewsPage })));
const WatchlistPage         = lazy(() => import('@/features/watchlist/WatchlistPage').then((m) => ({ default: m.WatchlistPage })));
const FundsPage             = lazy(() => import('@/features/funds/FundsPage').then((m) => ({ default: m.FundsPage })));
const StocksPage            = lazy(() => import('@/features/stocks/StocksPage').then((m) => ({ default: m.StocksPage })));
const CommoditiesPage       = lazy(() => import('@/features/commodities/CommoditiesPage').then((m) => ({ default: m.CommoditiesPage })));
const CryptoPage            = lazy(() => import('@/features/crypto/CryptoPage').then((m) => ({ default: m.CryptoPage })));
const PortfolioPage         = lazy(() => import('@/features/portfolio/PortfolioPage').then((m) => ({ default: m.PortfolioPage })));
const UsMarketsPage         = lazy(() => import('@/features/usMarkets/UsMarketsPage').then((m) => ({ default: m.UsMarketsPage })));
const HeatMapPage           = lazy(() => import('@/features/heatmap/HeatMapPage').then((m) => ({ default: m.HeatMapPage })));
const StockDetailPage       = lazy(() => import('@/features/stockDetail/StockDetailPage').then((m) => ({ default: m.StockDetailPage })));
const FundDetailPage        = lazy(() => import('@/features/fundDetail/FundDetailPage').then((m) => ({ default: m.FundDetailPage })));
const HistoryPage           = lazy(() => import('@/features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const MorningReportPage     = lazy(() => import('@/features/morning/MorningReportPage').then((m) => ({ default: m.MorningReportPage })));
const RecommendationsPage   = lazy(() => import('@/features/recommendations/RecommendationsPage').then((m) => ({ default: m.RecommendationsPage })));
const LoginPage             = lazy(() => import('@/features/auth/AuthPage').then((m) => ({ default: m.LoginPage })));
const SignupPage            = lazy(() => import('@/features/auth/AuthPage').then((m) => ({ default: m.SignupPage })));
const SmartSearchPage       = lazy(() => import('@/features/smartSearch/SmartSearchPage').then((m) => ({ default: m.SmartSearchPage })));
const FinancialLiteracyPage = lazy(() => import('@/features/literacy/FinancialLiteracyPage').then((m) => ({ default: m.FinancialLiteracyPage })));
const MembershipPage        = lazy(() => import('@/features/membership/MembershipPage').then((m) => ({ default: m.MembershipPage })));
const SettingsPage          = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const withSuspense = (node: React.ReactNode) => (
  <Suspense fallback={<PageSkeleton />}>{node}</Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/panel" replace /> },
      { path: 'panel', element: withSuspense(<PanelPage />) },
      { path: 'morning', element: withSuspense(<MorningReportPage />) },
      { path: 'recommendations', element: withSuspense(<RecommendationsPage />) },
      { path: 'egitim', element: withSuspense(<FinancialLiteracyPage />) },
      { path: 'uyelik', element: withSuspense(<MembershipPage />) },
      { path: 'news', element: withSuspense(<NewsPage />) },
      { path: 'macro', element: <Navigate to="/morning" replace /> },
      { path: 'watchlist', element: withSuspense(<WatchlistPage />) },
      { path: 'funds', element: withSuspense(<FundsPage />) },
      { path: 'stocks', element: withSuspense(<StocksPage />) },
      { path: 'emtia', element: withSuspense(<CommoditiesPage />) },
      { path: 'kripto', element: withSuspense(<CryptoPage />) },
      { path: 'portfoy', element: withSuspense(<PortfolioPage />) },
      { path: 'abd', element: withSuspense(<UsMarketsPage />) },
      { path: 'heatmap', element: withSuspense(<HeatMapPage />) },
      { path: 'stock/:symbol', element: withSuspense(<StockDetailPage />) },
      { path: 'fund/:code', element: withSuspense(<FundDetailPage />) },
      { path: 'history', element: withSuspense(<HistoryPage />) },
      { path: 'smart-search', element: withSuspense(<SmartSearchPage />) },
      { path: 'settings', element: withSuspense(<SettingsPage />) },
      { path: 'auth/login', element: withSuspense(<LoginPage />) },
      { path: 'auth/signup', element: withSuspense(<SignupPage />) },
      { path: '*', element: <Navigate to="/panel" replace /> },
    ],
  },
]);
