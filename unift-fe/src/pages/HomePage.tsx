import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Sidebar } from '@/components/layout';
import type { NavItem } from '@/components/layout';
import { RemoteHostsManagerPage } from './RemoteHostsManagerPage';

// ─── Nav registry — add new entries here as features ship ─────────────────

const NAV_ITEMS: NavItem[] = [
  { id: 'remote-hosts', label: 'Remote Hosts', icon: 'dns' },
];


// ─── Content router ────────────────────────────────────────────────────────

function renderContent(activeItem: string): React.ReactNode {
  switch (activeItem) {
    case 'remote-hosts': return <RemoteHostsManagerPage />;
    default:             return null;
  }
}

// ─── HomePage ──────────────────────────────────────────────────────────────

export function HomePage() {
  const { user, logout } = useAuthStore();
  const [activeNav, setActiveNav] = useState<string>(NAV_ITEMS[0].id);

  const handleLogout = async () => {
    await logout();
    window.location.replace('?page=login');
  };

  return (
    <div
      className="h-screen flex overflow-hidden"
      style={{ background: 'var(--color-bg-base)' }}
    >
      {/* ── Sidebar with footer ── */}
      <Sidebar
        items={NAV_ITEMS}
        activeItem={activeNav}
        onSelectItem={setActiveNav}
        footer={{
          username: user?.username ?? 'user',
          onLogout: handleLogout,
        }}
      />

      {/* ── Right column: content only ── */}
      <div className="flex flex-col flex-1 overflow-hidden" style={{ background: 'var(--color-bg-base)' }}>
        {/* Content area */}
        <main
          className="flex-1 overflow-auto custom-scrollbar"
          style={{ background: 'var(--color-bg-base)' }}
        >
          {renderContent(activeNav)}
        </main>
      </div>
    </div>
  );
}
