import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import DashboardPage from '@/pages/DashboardPage';
import MarketFinderPage from '@/pages/MarketFinderPage';

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'market-finder', element: <MarketFinderPage /> },
      // Temporarily hidden
      // { path: 'prices', element: <PricesPage /> },
      // { path: 'markets', element: <MarketsPage /> },
    ],
  },
]);

export default function AppRoutes() {
  return <RouterProvider router={router} />;
}
