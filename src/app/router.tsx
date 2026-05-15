import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './Layout';
import { PanelPage } from '@/features/panel/PanelPage';
import { NewsPage } from '@/features/news/NewsPage';
import { WatchlistPage } from '@/features/watchlist/WatchlistPage';
import { FundsPage } from '@/features/funds/FundsPage';
import { StockDetailPage } from '@/features/stockDetail/StockDetailPage';
import { FundDetailPage } from '@/features/fundDetail/FundDetailPage';
import { HistoryPage } from '@/features/history/HistoryPage';
import { MorningReportPage } from '@/features/morning/MorningReportPage';
import { RecommendationsPage } from '@/features/recommendations/RecommendationsPage';
import { LoginPage, SignupPage } from '@/features/auth/AuthPage';
import { SmartSearchPage } from '@/features/smartSearch/SmartSearchPage';
import { FinancialLiteracyPage } from '@/features/literacy/FinancialLiteracyPage';
import { MembershipPage } from '@/features/membership/MembershipPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/panel" replace /> },
      { path: 'panel', element: <PanelPage /> },
      { path: 'morning', element: <MorningReportPage /> },
      { path: 'recommendations', element: <RecommendationsPage /> },
      { path: 'egitim', element: <FinancialLiteracyPage /> },
      { path: 'uyelik', element: <MembershipPage /> },
      { path: 'news', element: <NewsPage /> },
      { path: 'macro', element: <Navigate to="/morning" replace /> },
      { path: 'watchlist', element: <WatchlistPage /> },
      { path: 'funds', element: <FundsPage /> },
      { path: 'stock/:symbol', element: <StockDetailPage /> },
      { path: 'fund/:code', element: <FundDetailPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'smart-search', element: <SmartSearchPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'auth/login', element: <LoginPage /> },
      { path: 'auth/signup', element: <SignupPage /> },
      { path: '*', element: <Navigate to="/panel" replace /> },
    ],
  },
]);
