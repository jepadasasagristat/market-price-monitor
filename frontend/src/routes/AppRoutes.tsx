import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import DashboardPage from '@/pages/DashboardPage';

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      // Temporarily hidden
      // { path: 'prices', element: <PricesPage /> },
      // { path: 'markets', element: <MarketsPage /> },
    ],
  },
]);

export default function AppRoutes() {
  return <RouterProvider router={router} />;
}
