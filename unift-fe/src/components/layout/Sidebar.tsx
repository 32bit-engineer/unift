// ─── Sidebar ───────────────────────────────────────────────────────────────

export interface NavItem {
  id:    string;
  label: string;
  icon:  string;
  badge?: number;
}

export interface SavedHost {
  id:     string;
  label:  string;
  status: 'online' | 'offline' | 'warning';
}

interface SidebarProps {
  activeItem:   string;
  onSelectItem: (id: string) => void;
  savedHosts?:  SavedHost[];
}

// ─── Section label ─────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="px-3 pt-4 pb-1.5 label"
      style={{ color: '#5a6380' }}
    >
      {children}
    </p>
  );
}

// ─── Nav Button ────────────────────────────────────────────────────────────
function NavButton({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 cursor-pointer
        text-[12px] font-sans transition-all duration-150 text-left
        ${isActive
          ? 'text-white'
          : 'text-slate-400 hover:text-slate-100 hover:bg-white/5 rounded'
        }`}
      style={
        isActive
          ? {
              background:   'rgba(79,142,247,0.1)',
              color:        'var(--color-text-warm)',
              borderLeft:   '3px solid var(--color-primary)',
              paddingLeft:  '9px',
              borderRadius: '0 2px 2px 0',
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
      {item.badge !== undefined && item.badge > 0 && (
        <span
          className="min-w-4.5 h-4.5 px-1 rounded-full text-[10px] font-bold font-mono flex items-center justify-center"
          style={{ background: '#E07B39', color: '#fff' }}
        >
          {item.badge}
        </span>
      )}
    </button>
  );
}

// ─── Static nav sections ────────────────────────────────────────────────────
const MAIN_NAV: NavItem[] = [
  { id: 'my-files',     label: 'My Files',     icon: 'folder' },
  { id: 'remote-hosts', label: 'Remote Host',  icon: 'dns' },
  { id: 'streaming',    label: 'Streaming',    icon: 'play_circle' },
];

const QUICK_ACCESS_NAV: NavItem[] = [
  { id: 'recent',   label: 'Recent',   icon: 'history' },
  { id: 'starred',  label: 'Starred',  icon: 'star',   badge: 3 },
  { id: 'shared',   label: 'Shared',   icon: 'share' },
  { id: 'trash',    label: 'Trash',    icon: 'delete' },
];

export function Sidebar({ activeItem, onSelectItem, savedHosts = [] }: SidebarProps) {
  const statusColor = (s: SavedHost['status']) =>
    s === 'online' ? '#4ade80' : s === 'warning' ? '#E07B39' : '#5a6380';

  return (
    <aside
      className="w-52 flex flex-col shrink-0"
      style={{
        background:  'var(--color-surface)',
        borderRight: '1px solid var(--color-border-muted)',
      }}
    >
      {/* ── Logo ── */}
      <div
        className="flex items-center gap-2.5 px-4 h-14 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border-muted)' }}
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center shrink-0"
          style={{ background: 'var(--color-primary)' }}
        >
          <span
            className="material-symbols-outlined text-white"
            style={{
              fontSize: '15px',
              fontVariationSettings: "'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 20",
            }}
          >
            terminal
          </span>
        </div>
        <span
          className="font-mono font-semibold tracking-widest uppercase text-[13px]"
          style={{ color: 'var(--color-text-warm)' }}
        >
          UniFT<span className="opacity-30">//OS</span>
        </span>
      </div>

      {/* ── Nav Sections ── */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar py-2">

        {/* MAIN */}
        <SectionLabel>Main</SectionLabel>
        <div className="flex flex-col gap-0.5 px-1">
          {MAIN_NAV.map(item => (
            <NavButton
              key={item.id}
              item={item}
              isActive={activeItem === item.id}
              onClick={() => onSelectItem(item.id)}
            />
          ))}
        </div>

        {/* QUICK ACCESS */}
        <SectionLabel>Quick Access</SectionLabel>
        <div className="flex flex-col gap-0.5 px-1">
          {QUICK_ACCESS_NAV.map(item => (
            <NavButton
              key={item.id}
              item={item}
              isActive={activeItem === item.id}
              onClick={() => onSelectItem(item.id)}
            />
          ))}
        </div>

        {/* SAVED HOSTS */}
        {savedHosts.length > 0 && (
          <>
            <SectionLabel>Saved Hosts</SectionLabel>
            <div className="flex flex-col gap-0.5 px-1">
              {savedHosts.map(host => (
                <button
                  key={host.id}
                  onClick={() => onSelectItem(`host:${host.id}`)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-[12px] text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all duration-150 text-left cursor-pointer"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: statusColor(host.status) }}
                  />
                  <span className="flex-1 truncate">{host.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </nav>

      {/* ── Footer ── */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderTop: '1px solid var(--color-border-muted)' }}
      >
        <p className="label">v0.0.1-dev</p>
      </div>
    </aside>
  );
}
