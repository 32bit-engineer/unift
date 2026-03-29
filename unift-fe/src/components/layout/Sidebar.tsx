// ─── Sidebar ───────────────────────────────────────────────────────────────
import React, { useState } from 'react';
import type { SavedHostResponse } from '@/utils/remoteConnectionAPI';

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
  activeItem:            string;
  onSelectItem:          (id: string) => void;
  savedHosts?:           SavedHost[];
  // Saved host configurations (bookmarked connections)
  savedHostConfigs?:     SavedHostResponse[];
  activeSessions?:       SavedHost[];
  connectingConfigId?:   string | null;
  deletingConfigId?:     string | null;
  onConnectConfig?:      (id: string) => void;
  onDeleteConfig?:       (id: string) => void;
  // Navigate to the full saved-hosts page when list > 10
  onShowAllSavedHosts?:  () => void;
}

// ─── Accordion ─────────────────────────────────────────────────────────────
const SAVED_CONNECTIONS_PREVIEW_LIMIT = 10;

function AccordionSection({
  title,
  count,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 pt-4 pb-1.5 text-left cursor-pointer group"
      >
        <span
          className="material-symbols-rounded shrink-0 transition-transform duration-200"
          style={{
            fontSize: '14px',
            color: '#5a6380',
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          chevron_right
        </span>
        <span className="label flex-1" style={{ color: '#5a6380' }}>
          {title}
        </span>
        {count > 0 && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(90,99,128,0.2)', color: '#5a6380' }}
          >
            {count}
          </span>
        )}
      </button>
      {isOpen && children}
    </div>
  );
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

// ─── Static nav sections ────────────────────────────────────────────────────
const MAIN_NAV: NavItem[] = [
  { id: 'my-files',       label: 'Dashbord',       icon: 'folder' },
  { id: 'remote-hosts',   label: 'Sessions',    icon: 'dns' },
];

const TRANSFERS_NAV: NavItem[] = [
  { id: 'transfer-history', label: 'Active Transfers', icon: 'swap_vert' },
  { id: 'transfer-log',     label: 'Transfer Log',     icon: 'history' },
  { id: 'upload-sessions',  label: 'Upload Sessions',  icon: 'cloud_upload' },
];

const QUICK_ACCESS_NAV: NavItem[] = [
  { id: 'recent',   label: 'Recent',   icon: 'history' },
  { id: 'starred',  label: 'Starred',  icon: 'star',   badge: 3 },
  { id: 'shared',   label: 'Shared',   icon: 'share' },
  { id: 'trash',    label: 'Trash',    icon: 'delete' },
];

export function Sidebar({
  activeItem,
  onSelectItem,
  savedHosts = [],
  savedHostConfigs = [],
  activeSessions = [],
  connectingConfigId = null,
  deletingConfigId = null,
  onConnectConfig,
  onDeleteConfig,
  onShowAllSavedHosts,
}: SidebarProps) {
  const [activeSessionsOpen, setActiveSessionsOpen] = useState(true);
  const [savedConnectionsOpen, setSavedConnectionsOpen] = useState(true);

  const statusColor = (s: SavedHost['status']) =>
    s === 'online' ? '#4ade80' : s === 'warning' ? '#E07B39' : '#5a6380';

  const visibleSavedConfigs = savedHostConfigs.slice(0, SAVED_CONNECTIONS_PREVIEW_LIMIT);
  const hasMore = savedHostConfigs.length > SAVED_CONNECTIONS_PREVIEW_LIMIT;

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

        {/* TRANSFERS */}
        <SectionLabel>Transfers</SectionLabel>
        <div className="flex flex-col gap-0.5 px-1">
          {TRANSFERS_NAV.map(item => (
            <NavButton
              key={item.id}
              item={item}
              isActive={activeItem === item.id}
              onClick={() => onSelectItem(item.id)}
            />
          ))}
        </div>

        {/* ACTIVE SESSIONS — accordion */}
        {savedHosts.length > 0 && (
          <AccordionSection
            title="Active Sessions"
            count={savedHosts.length}
            isOpen={activeSessionsOpen}
            onToggle={() => setActiveSessionsOpen(p => !p)}
          >
            <div className="flex flex-col gap-0.5 px-1 pb-1">
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
          </AccordionSection>
        )}

        {/* SAVED CONNECTIONS — accordion */}
        {savedHostConfigs.length > 0 && (
          <AccordionSection
            title="Saved Connections"
            count={savedHostConfigs.length}
            isOpen={savedConnectionsOpen}
            onToggle={() => setSavedConnectionsOpen(p => !p)}
          >
            <div className="flex flex-col gap-0.5 px-1 pb-1">
              {visibleSavedConfigs.map(cfg => {
                const displayName = cfg.label ?? cfg.hostname;
                const isConnecting = connectingConfigId === cfg.id;
                const isDeleting   = deletingConfigId   === cfg.id;
                const isAlreadyActive = activeSessions.some(
                  s => s.status === 'online' && s.label === displayName,
                );
                return (
                  <div
                    key={cfg.id}
                    className="group flex items-center gap-2 px-3 py-2 rounded hover:bg-white/5 transition-colors"
                  >
                    {/* Status/bookmark dot */}
                    <span
                      className="material-symbols-rounded shrink-0"
                      style={{
                        fontSize: '14px',
                        color: isAlreadyActive ? '#4ade80' : '#5a6380',
                        fontVariationSettings: isAlreadyActive
                          ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20"
                          : "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 20",
                      }}
                    >
                      {isAlreadyActive ? 'check_circle' : 'bookmark'}
                    </span>

                    {/* Label */}
                    <span className="flex-1 min-w-0 text-[12px] text-slate-400 group-hover:text-slate-200 truncate transition-colors">
                      {displayName}
                    </span>

                    {/* Action buttons — visible on hover */}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {isAlreadyActive ? (
                        <span
                          className="text-[10px] font-semibold text-emerald-500 px-1"
                        >
                          Active
                        </span>
                      ) : (
                        <button
                          onClick={() => onConnectConfig?.(cfg.id)}
                          disabled={isConnecting || isDeleting}
                          title="Connect"
                          className="w-5 h-5 flex items-center justify-center rounded brand-tint-hover text-slate-500 hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <span
                            className="material-symbols-rounded"
                            style={{ fontSize: '13px', fontVariationSettings: "'FILL' 1" }}
                          >
                            {isConnecting ? 'hourglass_bottom' : 'play_arrow'}
                          </span>
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteConfig?.(cfg.id)}
                        disabled={isConnecting || isDeleting}
                        title="Remove"
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-900/20 text-slate-600 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <span
                          className="material-symbols-rounded"
                          style={{ fontSize: '13px' }}
                        >
                          {isDeleting ? 'hourglass_bottom' : 'delete'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Show more — only when list exceeds the preview limit */}
              {hasMore && (
                <button
                  onClick={() => onShowAllSavedHosts?.()}
                  className="w-full flex items-center gap-1.5 px-3 py-2 text-[11px] text-slate-500 hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <span
                    className="material-symbols-rounded"
                    style={{ fontSize: '13px' }}
                  >
                    expand_more
                  </span>
                  Show all {savedHostConfigs.length} saved hosts
                </button>
              )}
            </div>
          </AccordionSection>
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
