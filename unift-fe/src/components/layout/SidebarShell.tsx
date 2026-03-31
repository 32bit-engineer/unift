// Shared sidebar shell — provides consistent chrome (logo, session indicator, footer,
// nav rendering) used by all workspace-specific sidebar variants.
import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface NavItem {
  id:    string;
  label: string;
  icon:  string;
  badge?: number;
}

interface SidebarShellProps {
  children: React.ReactNode;
}

/**
 * Outer sidebar frame used by every sidebar variant.
 * Renders logo header, scrollable nav area (children), and version footer.
 */
export function SidebarShell({ children }: SidebarShellProps) {
  const navigate = useNavigate();
  return (
    <aside
      className="w-52 flex flex-col shrink-0"
      style={{
        background:  'var(--color-surface)',
        borderRight: '1px solid var(--color-border-muted)',
      }}
    >
      {/* Logo */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2.5 px-4 h-14 shrink-0 w-full cursor-pointer hover:bg-white/3 transition-colors"
        style={{ borderBottom: '1px solid var(--color-border-muted)' }}
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center shrink-0"
          style={{ background: 'var(--color-primary)' }}
        >
          <span
            className="material-symbols-rounded text-white"
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
      </button>

      {/* Scrollable nav content */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar py-2">
        {children}
      </nav>

      {/* Footer */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderTop: '1px solid var(--color-border-muted)' }}
      >
        <p className="label">v0.0.1-dev</p>
      </div>
    </aside>
  );
}

/**
 * Section label used to group nav items.
 */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="px-3 pt-4 pb-1.5 label"
      style={{ color: '#5a6380' }}
    >
      {children}
    </p>
  );
}

/**
 * Individual navigation button with active-state highlight.
 */
export function NavButton({
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
        className="material-symbols-rounded shrink-0"
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

interface SessionIndicatorProps {
  sessionName: string;
  onBack: () => void;
  backLabel?: string;
}

/**
 * Session context indicator shown at the top of workspace sidebars.
 * Displays the session name with a green dot and a "back" link.
 */
export function SessionIndicator({ sessionName, onBack, backLabel = 'Back to Infrastructure' }: SessionIndicatorProps) {
  return (
    <div className="px-3 pt-1 pb-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: '#4ade80' }}
        />
        <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--color-text-warm)' }}>
          {sessionName}
        </span>
      </div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[11px] font-medium cursor-pointer px-2 py-1 rounded-md transition-all hover:bg-white/8"
        style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-muted)' }}
      >
        <span
          className="material-symbols-rounded"
          style={{ fontSize: '13px', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
        >
          arrow_back
        </span>
        {backLabel}
      </button>
    </div>
  );
}

interface WorkspaceTypeSwitcherProps {
  currentType: 'ssh' | 'docker' | 'kubernetes';
  availableTypes: Array<'ssh' | 'docker' | 'kubernetes'>;
  onSwitch: (type: 'ssh' | 'docker' | 'kubernetes') => void;
}

const TYPE_META: Record<string, { label: string; icon: string }> = {
  ssh:        { label: 'SSH',        icon: 'terminal' },
  docker:     { label: 'Docker',     icon: 'view_in_ar' },
  kubernetes: { label: 'Kubernetes', icon: 'deployed_code' },
};

/**
 * Allows switching between workspace types (SSH / Docker / K8s)
 * when multiple capabilities are detected.
 */
export function WorkspaceTypeSwitcher({ currentType, availableTypes, onSwitch }: WorkspaceTypeSwitcherProps) {
  if (availableTypes.length <= 1) return null;

  return (
    <div className="px-3 pb-2">
      <div className="flex gap-1 p-0.5 rounded" style={{ background: 'rgba(0,0,0,0.2)' }}>
        {availableTypes.map(type => {
          const meta = TYPE_META[type];
          const isActive = type === currentType;
          return (
            <button
              key={type}
              onClick={() => onSwitch(type)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-medium transition-all cursor-pointer
                ${isActive
                  ? 'text-white'
                  : 'text-slate-500 hover:text-slate-300'
                }`}
              style={isActive ? { background: 'var(--color-primary)', opacity: 0.9 } : {}}
            >
              <span
                className="material-symbols-rounded"
                style={{
                  fontSize: '13px',
                  fontVariationSettings: isActive
                    ? "'FILL' 1, 'wght' 400"
                    : "'FILL' 0, 'wght' 300",
                }}
              >
                {meta.icon}
              </span>
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
