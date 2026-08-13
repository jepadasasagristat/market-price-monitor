import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import daLogo from '@/assets/images/da-logo.png';
import { ChevronLeftIcon, ChevronRightIcon } from './navIcons';

type AppHeaderProps = {
  menuOpen: boolean;
  sidebarCollapsed: boolean;
  onToggleMenu: () => void;
  onToggleSidebar: () => void;
};

const MANILA_TZ = 'Asia/Manila';

function formatLiveClock(date: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

function useManilaClock(): string {
  const [now, setNow] = useState(() => formatLiveClock(new Date()));

  useEffect(() => {
    const tick = () => setNow(formatLiveClock(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return now;
}

export default function AppHeader({
  menuOpen,
  sidebarCollapsed,
  onToggleMenu,
  onToggleSidebar,
}: AppHeaderProps) {
  const liveClock = useManilaClock();

  return (
    <header className="app-header">
      <div className="header-start">
        <button
          type="button"
          className="header-icon-btn menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={onToggleMenu}
        >
          <span className="menu-toggle-icon" aria-hidden />
        </button>
        <button
          type="button"
          className="header-icon-btn sidebar-toggle-desktop"
          aria-expanded={!sidebarCollapsed}
          aria-controls="app-sidebar"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleSidebar}
        >
          {sidebarCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>

        <NavLink to="/" className="brand" end>
          <span className="brand-mark">
            <img src={daLogo} alt="" className="brand-logo" />
          </span>
          <span className="brand-text">
            <strong>Presyong Palengke</strong>
            <span>Department of Agriculture · Market Price Monitoring</span>
          </span>
        </NavLink>
      </div>

      <div className="header-actions">
        <div className="header-status" title="Live Manila time">
          <svg
            className="header-status-icon"
            viewBox="0 0 20 20"
            width="14"
            height="14"
            aria-hidden
          >
            <circle
              cx="10"
              cy="10"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M10 6.5V10l2.5 1.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="header-status-kicker">Local time</span>
          <span className="header-status-value header-status-clock" aria-live="polite">
            {liveClock}
          </span>
        </div>
      </div>
    </header>
  );
}
