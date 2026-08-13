import type { ReactNode } from 'react';
import { HomeIcon, MapPinIcon } from './navIcons';

export type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
};

export type NavSection = {
  id: string;
  title: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'monitor',
    title: 'Price Monitoring',
    items: [
      { to: '/', label: 'Overview', icon: <HomeIcon />, end: true },
      { to: '/market-finder', label: 'Market Finder', icon: <MapPinIcon /> },
      // Temporarily hidden
      // { to: '/prices', label: 'Commodity Prices', icon: <TableIcon /> },
      // { to: '/markets', label: 'Markets Map', icon: <MapPinIcon /> },
    ],
  },
];
