import { NavLink } from 'react-router-dom';
import type { NavSection } from './navConfig';
import { ChevronLeftIcon, ChevronRightIcon } from './navIcons';

type AppSidebarProps = {
  sections: NavSection[];
  collapsed: boolean;
  menuOpen: boolean;
  onNavigate?: () => void;
  onToggleCollapse: () => void;
};

export default function AppSidebar({
  sections,
  collapsed,
  menuOpen,
  onNavigate,
  onToggleCollapse,
}: AppSidebarProps) {
  return (
    <aside
      id="app-sidebar"
      className={`app-sidebar ${menuOpen ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}
      aria-label="Main navigation"
      aria-expanded={!collapsed}
    >
      <nav className="sidebar-nav">
        {sections.map((section) => (
          <div key={section.id} className="nav-section">
            <span className="nav-section-title">{section.title}</span>
            <span className="nav-section-divider" aria-hidden />
            <ul className="nav-section-list">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                    title={collapsed ? item.label : undefined}
                    onClick={onNavigate}
                  >
                    <span className="nav-link-icon">{item.icon}</span>
                    <span className="nav-link-label">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          <span className="sidebar-collapse-label">{collapsed ? 'Expand' : 'Collapse'}</span>
        </button>
      </div>
    </aside>
  );
}
