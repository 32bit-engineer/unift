// ─── Sidebar ───────────────────────────────────────────────────────────────

export interface NavItem {
  id:    string;
  label: string;
  icon:  string;
}

export interface SidebarFooterProps {
  username: string;
  onLogout: () => void;
}

interface SidebarProps {
  items:        NavItem[];
  activeItem:   string;
  onSelectItem: (id: string) => void;
  footer?:      SidebarFooterProps;
}

export function Sidebar({ items, activeItem, onSelectItem, footer }: SidebarProps) {
  return (
    <aside
      className="w-56 flex flex-col shrink-0"
      style={{
        background: 'var(--color-surface)',
        borderRight: '2px solid var(--color-border-muted)',
        boxShadow: '2px 0 0 0 var(--color-bg-base)',
      }}
    >
      {/* Logo lockup */}
      <div
        className="flex items-center gap-2.5 px-4 h-16 shrink-0"
        style={{ borderBottom: '2px solid #2E3348' }}
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center shrink-0"
          style={{ background: 'var(--color-primary)' }}
        >
          <span
            className="material-symbols-outlined text-white"
            style={{
              fontSize: '18px',
              fontVariationSettings: "'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 20",
            }}
          >
            terminal
          </span>
        </div>
        <span
          className="font-mono font-semibold tracking-widest uppercase text-[14px]"
          style={{ color: 'var(--color-text-warm)' }}
        >
          UniFT<span className="opacity-30">//OS</span>
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto custom-scrollbar">
        {items.map((item) => {
          const isActive = activeItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded cursor-pointer
                text-[12px] font-sans transition-all duration-150 text-left
                ${isActive
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`}
              style={
                isActive
                  ? {
                      background:   'rgba(79,142,247,0.1)',
                      color:        'var(--color-text-warm)',
                      borderLeft:   '2px solid var(--color-primary)',
                      paddingLeft:  '10px',
                    }
                  : {}
              }
            >
              <span
                className="material-symbols-outlined shrink-0"
                style={{
                  fontSize: '18px',
                  lineHeight: 1,
                  fontVariationSettings: isActive
                    ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                    : "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24",
                }}
              >
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="px-4 py-3 shrink-0 space-y-3"
        style={{ borderTop: '1px solid var(--color-border-muted)' }}
      >
        {footer && (
          <div className="space-y-2.5">
            {/* Online indicator + username */}
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--color-status-ok)' }}
              />
              <span className="font-mono text-[12px]" style={{ color: '#5a6380' }}>
                {footer.username}
              </span>
            </div>

            {/* Sign out button */}
            <button
              onClick={footer.onLogout}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded cursor-pointer
                font-mono text-[10px] uppercase tracking-widest
                border transition-all duration-150 hover:bg-white/5"
              style={{
                borderColor: 'var(--color-border-muted)',
                color:       '#5a6380',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '15px', lineHeight: 1 }}
              >
                logout
              </span>
              Sign out
            </button>
          </div>
        )}
        <p className="label">v0.0.1-dev</p>
      </div>
    </aside>
  );
}
