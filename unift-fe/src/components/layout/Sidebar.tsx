import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SavedHostResponse } from '@/utils/remoteConnectionAPI';
import type { SessionCapabilities } from '@/store/connectionStore';

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
  // Workspace context — set when viewing a specific session workspace
  workspaceSessionName?: string | null;
  workspaceCapabilities?: SessionCapabilities | null;
}

// ─── Accordion component for collapsible sections (Active Sessions, Saved Connections)
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

// Static nav items for main sections after login
const MAIN_NAV: NavItem[] = [
  { id: 'connection-hub',  label: 'Infrastructure',  icon: 'hub' },
  { id: 'my-files',        label: 'Dashboard',       icon: 'dashboard' },
  { id: 'remote-hosts',    label: 'Sessions',        icon: 'dns' },
  { id: 'transfer-history', label: 'Transfers',      icon: 'swap_vert' },
];

// Dynamic workspace nav items — rendered when user is inside a session workspace
const WORKSPACE_BASE_NAV: NavItem[] = [
  { id: 'ws-overview',  label: 'Overview',        icon: 'dashboard' },
  { id: 'ws-terminal',  label: 'Terminal',         icon: 'terminal' },
  { id: 'ws-files',     label: 'File Browser',     icon: 'folder_open' },
];

const WORKSPACE_DOCKER_NAV: NavItem[] = [
  { id: 'ws-docker-containers', label: 'Containers', icon: 'view_in_ar' },
  { id: 'ws-docker-images',     label: 'Images',     icon: 'layers' },
];

const WORKSPACE_K8S_NAV: NavItem[] = [
  { id: 'ws-k8s-pods',        label: 'Pods',         icon: 'deployed_code' },
  { id: 'ws-k8s-deployments', label: 'Deployments',  icon: 'rocket_launch' },
  { id: 'ws-k8s-services',    label: 'Services',     icon: 'hub' },
  { id: 'ws-k8s-nodes',       label: 'Nodes',        icon: 'dns' },
];

const WORKSPACE_MONITORING_NAV: NavItem[] = [
  { id: 'ws-monitoring', label: 'Monitoring',  icon: 'monitoring' },
  { id: 'ws-logs',       label: 'Logs',        icon: 'list_alt' },
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
  workspaceSessionName = null,
  workspaceCapabilities = null,
}: SidebarProps) {
  const navigate = useNavigate();
  const [activeSessionsOpen, setActiveSessionsOpen] = useState(true);
  const [savedConnectionsOpen, setSavedConnectionsOpen] = useState(true);

  const isInWorkspace = workspaceSessionName !== null;

  // Build workspace nav items dynamically based on capabilities
  const workspaceNav = useMemo(() => {
    if (!isInWorkspace || !workspaceCapabilities) return [];
    const items: NavItem[] = [...WORKSPACE_BASE_NAV];
    return items;
  }, [isInWorkspace, workspaceCapabilities]);

  const workspaceDockerNav = useMemo(() => {
    if (!workspaceCapabilities?.docker) return [];
    return [...WORKSPACE_DOCKER_NAV];
  }, [workspaceCapabilities?.docker]);

  const workspaceK8sNav = useMemo(() => {
    if (!workspaceCapabilities?.kubernetes) return [];
    return [...WORKSPACE_K8S_NAV];
  }, [workspaceCapabilities?.kubernetes]);

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

      {/* ── Nav Sections ── */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar py-2">

        {/* WORKSPACE CONTEXT — only when inside a session workspace */}
        {isInWorkspace && (
          <>
            <div className="px-3 pt-1 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: '#4ade80' }}
                />
                <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--color-text-warm)' }}>
                  {workspaceSessionName}
                </span>
              </div>
              <button
                onClick={() => onSelectItem('connection-hub')}
                className="text-[10px] cursor-pointer hover:underline transition-colors"
                style={{ color: '#5a6380' }}
              >
                Back to Infrastructure
              </button>
            </div>

            <SectionLabel>Workspace</SectionLabel>
            <div className="flex flex-col gap-0.5 px-1">
              {workspaceNav.map(item => (
                <NavButton
                  key={item.id}
                  item={item}
                  isActive={activeItem === item.id}
                  onClick={() => onSelectItem(item.id)}
                />
              ))}
            </div>

            {workspaceDockerNav.length > 0 && (
              <>
                <SectionLabel>Docker</SectionLabel>
                <div className="flex flex-col gap-0.5 px-1">
                  {workspaceDockerNav.map(item => (
                    <NavButton
                      key={item.id}
                      item={item}
                      isActive={activeItem === item.id}
                      onClick={() => onSelectItem(item.id)}
                    />
                  ))}
                </div>
              </>
            )}

            {workspaceK8sNav.length > 0 && (
              <>
                <SectionLabel>Kubernetes</SectionLabel>
                <div className="flex flex-col gap-0.5 px-1">
                  {workspaceK8sNav.map(item => (
                    <NavButton
                      key={item.id}
                      item={item}
                      isActive={activeItem === item.id}
                      onClick={() => onSelectItem(item.id)}
                    />
                  ))}
                </div>
              </>
            )}

            <SectionLabel>Observability</SectionLabel>
            <div className="flex flex-col gap-0.5 px-1">
              {WORKSPACE_MONITORING_NAV.map(item => (
                <NavButton
                  key={item.id}
                  item={item}
                  isActive={activeItem === item.id}
                  onClick={() => onSelectItem(item.id)}
                />
              ))}
            </div>

            <div className="my-3 mx-3" style={{ borderTop: '1px solid var(--color-border-muted)' }} />
          </>
        )}

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
