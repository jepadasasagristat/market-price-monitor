import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import AppHeader from './AppHeader';
import AppSidebar from './AppSidebar';
import { NAV_SECTIONS } from './navConfig';

export default function AppLayout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('nav-open', menuOpen);
    return () => document.body.classList.remove('nav-open');
  }, [menuOpen]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), []);

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <AppHeader
        menuOpen={menuOpen}
        sidebarCollapsed={sidebarCollapsed}
        onToggleMenu={toggleMenu}
        onToggleSidebar={toggleSidebar}
      />

      <div className="app-body">
        <button
          type="button"
          className={`nav-backdrop ${menuOpen ? 'is-visible' : ''}`}
          aria-label="Close navigation menu"
          onClick={closeMenu}
        />
        <AppSidebar
          sections={NAV_SECTIONS}
          collapsed={sidebarCollapsed}
          menuOpen={menuOpen}
          onNavigate={closeMenu}
          onToggleCollapse={toggleSidebar}
        />
        <main id="main-content" className="app-main">
          <div key={location.pathname} className="page-transition">
            <Outlet />
          </div>
        </main>
      </div>

      <footer className="app-footer">
        <div className="app-footer-inner">
          <div className="app-footer-brand">
            <span className="app-footer-product">Presyong Palengke</span>
            <span className="app-footer-sep" aria-hidden>
              ·
            </span>
            <span className="app-footer-org">
              Department of Agriculture · Bantay Presyo
            </span>
          </div>
          <a
            className="app-footer-source"
            href="http://www.bantaypresyo.da.gov.ph/"
            target="_blank"
            rel="noopener noreferrer"
            title="Open DA Price Watch — Bantay Presyo"
          >
            Data Source : DA Price Watch — Bantay Presyo
          </a>
        </div>
      </footer>
    </div>
  );
}
