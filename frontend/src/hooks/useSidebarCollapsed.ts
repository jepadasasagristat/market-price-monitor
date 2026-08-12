import { useCallback, useState } from 'react';

const STORAGE_KEY = 'presyong-palengke-sidebar-collapsed';

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
