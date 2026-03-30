// ─── KineticWorkspacePage ───────────────────────────────────────────────────
// Full-screen workspace for an active SSH session.
// On mount it checks for Docker on the remote host via a hidden terminal WS.
// - Docker found → DockerModal (user can choose Docker workspace or SSH workspace)
// - Docker absent (or user dismisses) → SSHWorkspace
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { SessionAnalyticsResponse } from '@/utils/remoteConnectionAPI';
import { FileBrowser } from './RemoteHostsManager/FileBrowser';
import { TerminalPanel } from './RemoteHostsManager/TerminalPanel';
import { useNetworkMonitor, useDockerDetect } from '@/hooks/useNetworkMonitor';
import type { UIHost } from './RemoteHostsManager/types';

type WorkspaceView = 'overview' | 'browser';

interface KineticWorkspacePageProps {
  session: UIHost;
  onBack: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '--';
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024)         return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}

// ─── Resource Gauge ───────────────────────────────────────────────────────────

function ResourceGauge({
  label,
  icon,
  value,
  detail,
  color,
}: {
  label: string;
  icon: string;
  value: number | null;
  detail: string;
  color: string;
}) {
  const pct = value ?? 0;
  const dangerThreshold = label === 'Swap' ? 80 : 85;
  const warnThreshold   = label === 'Swap' ? 60 : 70;
  const barColor =
    pct >= dangerThreshold ? '#f87171' :
    pct >= warnThreshold   ? '#facc15' :
    color;

  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-xl"
      style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-rounded"
            style={{ fontSize: '15px', color: barColor,
              fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
          >
            {icon}
          </span>
          <span className="label" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>
            {label}
          </span>
        </div>
        <span
          className="text-[13px] font-semibold font-mono"
          style={{ color: value == null ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}
        >
          {value == null ? '--' : `${pct.toFixed(1)}%`}
        </span>
      </div>

      {/* Progress track */}
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: '4px', background: 'var(--color-border-muted)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
        />
      </div>

      <p className="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>
        {detail}
      </p>
    </div>
  );
}

// ─── Network Stats Row ────────────────────────────────────────────────────────

function NetStatsBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col gap-0.5 items-center">
      <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </span>
      <span className="text-[15px] font-bold font-mono" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 0.01);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - (v / max) * 95;
    return `${x},${y}`;
  });
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height: '32px' }}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.7}
      />
    </svg>
  );
}

// ─── Overview Panel ───────────────────────────────────────────────────────────

function OverviewPanel({ session }: { session: UIHost }) {
  const [analytics, setAnalytics] = useState<SessionAnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const intervalRef = useRef<number | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await remoteConnectionAPI.getSessionAnalytics(session.sessionId);
      setAnalytics(data);
    } catch {
      // Non-fatal — display what we have
    } finally {
      setAnalyticsLoading(false);
    }
  }, [session.sessionId]);

  useEffect(() => {
    void fetchAnalytics();
    intervalRef.current = window.setInterval(fetchAnalytics, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAnalytics]);

  const netMonitor = useNetworkMonitor(session.sessionId);
  const sys = analytics?.systemMetrics;
  const meta = analytics?.metadata;
  const hostname = session.userAtIp.split('@')[1] ?? session.userAtIp;

  const rxHistory = netMonitor.history.map(s => s.rxKbps);
  const txHistory = netMonitor.history.map(s => s.txKbps);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="max-w-4xl w-full mx-auto flex flex-col gap-6">

        {/* ── Server Identity ── */}
        <section>
          <p className="label mb-3" style={{ color: '#5a6380' }}>Server Identity</p>
          <div
            className="rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-4"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
          >
            {[
              { label: 'Hostname',  value: hostname },
              { label: 'Username',  value: session.userAtIp.split('@')[0] ?? '--' },
              { label: 'Protocol',  value: session.protocol },
              { label: 'Port',      value: String(session.port) },
              { label: 'OS',        value: meta?.remoteOs ?? analytics?.host ?? '--' },
              { label: 'Session',   value: session.sessionId.slice(0, 8) + '…' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] font-mono uppercase tracking-widest mb-0.5"
                   style={{ color: 'var(--color-text-muted)' }}>
                  {label}
                </p>
                <p className="text-[12px] font-mono truncate"
                   style={{ color: 'var(--color-text-primary)' }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Resource Gauges ── */}
        <section>
          <p className="label mb-3" style={{ color: '#5a6380' }}>Resource Usage</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ResourceGauge
              label="CPU"
              icon="memory"
              value={analyticsLoading ? null : (sys?.cpuPercent ?? null)}
              detail={analyticsLoading ? 'Loading…' : (sys?.cpuPercent != null ? `${sys.cpuPercent.toFixed(1)}% utilisation` : 'Unavailable')}
              color="#7C6DFA"
            />
            <ResourceGauge
              label="Memory"
              icon="storage"
              value={analyticsLoading ? null : (sys?.memoryUsedPercent ?? null)}
              detail={
                analyticsLoading ? 'Loading…' :
                (sys?.memoryUsedBytes != null && sys?.memoryTotalBytes != null)
                  ? `${fmtBytes(sys.memoryUsedBytes)} / ${fmtBytes(sys.memoryTotalBytes)}`
                  : 'Unavailable'
              }
              color="#26A69A"
            />
            <ResourceGauge
              label="Disk"
              icon="hard_drive"
              value={analyticsLoading ? null : (sys?.diskUsedPercent ?? null)}
              detail={
                analyticsLoading ? 'Loading…' :
                (sys?.diskUsedBytes != null && sys?.diskTotalBytes != null)
                  ? `${fmtBytes(sys.diskUsedBytes)} / ${fmtBytes(sys.diskTotalBytes)}`
                  : 'Unavailable'
              }
              color="#E07B39"
            />
          </div>
        </section>

        {/* ── Network I/O ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="label" style={{ color: '#5a6380' }}>Live Network I/O</p>
            <span
              className="flex items-center gap-1.5 text-[10px] font-mono"
              style={{ color: netMonitor.connected ? '#4ade80' : '#5a6380' }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: netMonitor.connected ? '#4ade80' : '#5a6380' }}
              />
              {netMonitor.connected ? 'Live' : 'Connecting…'}
            </span>
          </div>

          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
          >
            {/* Current reading */}
            <div className="flex items-center justify-around mb-4">
              <NetStatsBadge
                label="↓  Download"
                value={netMonitor.latest ? `${netMonitor.latest.rxKbps.toFixed(2)} KB/s` : '--'}
                color="#7C6DFA"
              />
              <div className="w-px h-8" style={{ background: 'var(--color-border-muted)' }} />
              <NetStatsBadge
                label="↑  Upload"
                value={netMonitor.latest ? `${netMonitor.latest.txKbps.toFixed(2)} KB/s` : '--'}
                color="#4ade80"
              />
            </div>

            {/* Sparklines */}
            {netMonitor.history.length > 1 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-mono mb-1" style={{ color: '#7C6DFA' }}>Download</p>
                  <Sparkline data={rxHistory} color="#7C6DFA" />
                </div>
                <div>
                  <p className="text-[10px] font-mono mb-1" style={{ color: '#4ade80' }}>Upload</p>
                  <Sparkline data={txHistory} color="#4ade80" />
                </div>
              </div>
            )}

            {/* Rolling feed table */}
            {netMonitor.history.length > 0 && (
              <div className="mt-4">
                <div
                  className="rounded-lg overflow-hidden"
                  style={{ border: '1px solid var(--color-border-subtle)' }}
                >
                  <div
                    className="grid grid-cols-3 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest"
                    style={{
                      background: 'var(--color-bg-base)',
                      color: 'var(--color-text-muted)',
                      borderBottom: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    <span>Time</span>
                    <span>↓ Rx (KB/s)</span>
                    <span>↑ Tx (KB/s)</span>
                  </div>
                  <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: '160px' }}>
                    {[...netMonitor.history].reverse().slice(0, 15).map((s, i) => (
                      <div
                        key={s.capturedAt}
                        className="grid grid-cols-3 px-3 py-1.5 text-[11px] font-mono transition-colors"
                        style={{
                          color: i === 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          background: i === 0 ? 'rgba(124,109,250,0.04)' : 'transparent',
                          borderBottom: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        <span>{new Date(s.capturedAt).toLocaleTimeString()}</span>
                        <span style={{ color: '#7C6DFA' }}>{s.rxKbps.toFixed(2)}</span>
                        <span style={{ color: '#4ade80' }}>{s.txKbps.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Empty state */}
            {netMonitor.history.length === 0 && !netMonitor.error && (
              <div className="flex items-center justify-center py-6">
                <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                  Waiting for network data…
                </p>
              </div>
            )}

            {netMonitor.error && (
              <div className="flex items-center justify-center py-6">
                <p className="text-[12px]" style={{ color: '#f87171' }}>
                  {netMonitor.error}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── Latency ── */}
        {analytics?.latency && !analytics.latency.unavailable && (
          <section>
            <p className="label mb-3" style={{ color: '#5a6380' }}>Latency</p>
            <div
              className="rounded-xl p-4 grid grid-cols-3 gap-4"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
            >
              {[
                { label: 'Avg', value: `${analytics.latency.avgMs?.toFixed(1) ?? '--'} ms` },
                { label: 'Min', value: `${analytics.latency.minMs?.toFixed(1) ?? '--'} ms` },
                { label: 'Max', value: `${analytics.latency.maxMs?.toFixed(1) ?? '--'} ms` },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-[10px] font-mono uppercase tracking-widest mb-1"
                     style={{ color: 'var(--color-text-muted)' }}>
                    {label}
                  </p>
                  <p className="text-[15px] font-bold font-mono"
                     style={{ color: 'var(--color-text-primary)' }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

// ─── Kinetic Sidebar ─────────────────────────────────────────────────────────

function KineticSidebar({
  session,
  activeView,
  onSelectView,
  onBack,
}: {
  session: UIHost;
  activeView: WorkspaceView;
  onSelectView: (v: WorkspaceView) => void;
  onBack: () => void;
}) {
  const hostname = session.userAtIp.split('@')[1] ?? session.userAtIp;
  const isOnline = session.status === 'online';

  const navItems: { id: WorkspaceView; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview',     icon: 'monitoring' },
    { id: 'browser',  label: 'File Browser', icon: 'folder_open' },
  ];

  return (
    <aside
      className="flex flex-col shrink-0"
      style={{
        width: '200px',
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border-muted)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 h-14 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border-muted)' }}
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center shrink-0"
          style={{ background: 'var(--color-primary)' }}
        >
          <span
            className="material-symbols-rounded text-white"
            style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
          >
            bolt
          </span>
        </div>
        <span
          className="font-mono font-semibold text-[12px] truncate"
          style={{ color: 'var(--color-text-warm)' }}
        >
          Kinetic
        </span>
      </div>

      {/* Session info card */}
      <div
        className="mx-3 mt-3 p-2.5 rounded-lg"
        style={{
          background: 'var(--color-bg-base)',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: isOnline ? '#4ade80' : '#f87171' }}
          />
          <span
            className="text-[11px] font-semibold truncate"
            style={{ color: 'var(--color-text-primary)' }}
          >
            {session.name !== `${hostname}:${session.port}` ? session.name : hostname}
          </span>
        </div>
        <p className="text-[10px] font-mono truncate" style={{ color: 'var(--color-text-muted)' }}>
          {hostname}:{session.port}
        </p>
        <p className="text-[10px] font-mono truncate mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
          {session.protocol}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2">
        {navItems.map(item => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 mb-0.5 text-[12px] font-sans transition-all duration-150 text-left cursor-pointer rounded`}
              style={
                isActive
                  ? {
                      background:   'rgba(79,142,247,0.1)',
                      color:        'var(--color-text-warm)',
                      borderLeft:   '3px solid var(--color-primary)',
                      paddingLeft:  '9px',
                      borderRadius: '0 4px 4px 0',
                    }
                  : { color: '#9090B0' }
              }
            >
              <span
                className="material-symbols-rounded shrink-0"
                style={{
                  fontSize: '17px',
                  lineHeight: 1,
                  fontVariationSettings: isActive
                    ? "'FILL' 1, 'wght' 400"
                    : "'FILL' 0, 'wght' 300",
                }}
              >
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Back button */}
      <div
        className="px-3 py-3 shrink-0"
        style={{ borderTop: '1px solid var(--color-border-muted)' }}
      >
        <button
          onClick={onBack}
          className="w-full flex items-center gap-2 px-3 py-2 rounded text-[11px] font-mono transition-colors cursor-pointer hover:bg-white/5"
          style={{ color: '#5a6380' }}
        >
          <span className="material-symbols-rounded" style={{ fontSize: '15px' }}>arrow_back</span>
          Back to Hub
        </button>
      </div>
    </aside>
  );
}

// ─── Docker Detection Modal ───────────────────────────────────────────────────

function DockerModal({
  onManageDocker,
  onContinueSsh,
}: {
  onManageDocker: () => void;
  onContinueSsh: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="flex flex-col gap-5 p-6 rounded-2xl max-w-sm w-full mx-4"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-muted)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Icon & title */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(38,166,154,0.12)', border: '1px solid rgba(38,166,154,0.2)' }}
          >
            {/* Docker whale icon approximation */}
            <span
              className="material-symbols-rounded"
              style={{ fontSize: '22px', color: '#26A69A',
                fontVariationSettings: "'FILL' 0, 'wght' 300" }}
            >
              deployed_code
            </span>
          </div>
          <div>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Docker Detected
            </p>
            <p className="text-[11px] font-mono" style={{ color: 'var(--color-text-muted)' }}>
              Container runtime found on this server
            </p>
          </div>
        </div>

        {/* Body */}
        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          We observed that <strong style={{ color: 'var(--color-text-primary)' }}>Docker is installed</strong> on
          this server. Would you like to manage Docker containers and images explicitly, or continue
          with the standard SSH workspace?
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onManageDocker}
            className="w-full py-2.5 rounded-xl text-[12px] font-semibold transition-all duration-150 cursor-pointer brand-gradient-hover"
            style={{ background: 'var(--gradient-primary)', color: '#fff' }}
          >
            Manage with Docker
          </button>
          <button
            onClick={onContinueSsh}
            className="w-full py-2.5 rounded-xl text-[12px] font-medium transition-all duration-150 cursor-pointer hover:bg-white/5"
            style={{
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-muted)',
            }}
          >
            Continue with SSH Workspace
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Docker Workspace Placeholder ────────────────────────────────────────────

function DockerWorkspacePlaceholder({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(38,166,154,0.1)', border: '1px solid rgba(38,166,154,0.2)' }}
      >
        <span
          className="material-symbols-rounded"
          style={{ fontSize: '32px', color: '#26A69A',
            fontVariationSettings: "'FILL' 0, 'wght' 300" }}
        >
          deployed_code
        </span>
      </div>
      <div className="text-center">
        <p className="text-[15px] font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
          Docker Workspace
        </p>
        <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
          Container management coming soon.
        </p>
      </div>
      <button
        onClick={onBack}
        className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium cursor-pointer transition-colors hover:bg-white/5"
        style={{ border: '1px solid var(--color-border-muted)', color: 'var(--color-text-secondary)' }}
      >
        <span className="material-symbols-rounded" style={{ fontSize: '15px' }}>arrow_back</span>
        Back to SSH Workspace
      </button>
    </div>
  );
}

// ─── SSH Workspace ────────────────────────────────────────────────────────────

function SshWorkspace({
  session,
  onBack,
}: {
  session: UIHost;
  onBack: () => void;
}) {
  const [activeView, setActiveView] = useState<WorkspaceView>('overview');

  // Terminal panel state
  const [terminalOpen, setTerminalOpen]           = useState(false);
  const [terminalHeight, setTerminalHeight]       = useState(280);
  const [terminalMinimized, setTerminalMinimized] = useState(false);

  const openTerminal = () => {
    setTerminalOpen(true);
    setTerminalMinimized(false);
  };

  const handleTerminalResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY      = e.clientY;
    const startHeight = terminalHeight;
    const onMouseMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      setTerminalHeight(Math.max(120, Math.min(600, startHeight + delta)));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="flex h-full overflow-hidden">
      <KineticSidebar
        session={session}
        activeView={activeView}
        onSelectView={setActiveView}
        onBack={onBack}
      />

      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--color-bg-base)' }}>
        {activeView === 'overview' && <OverviewPanel session={session} />}

        {activeView === 'browser' && (
          <>
            <div className="flex-1 overflow-hidden">
              <FileBrowser
                host={session}
                onClose={() => setActiveView('overview')}
                onOpenTerminal={openTerminal}
              />
            </div>

            <TerminalPanel
              sessions={[session]}
              terminalOpen={terminalOpen}
              terminalMinimized={terminalMinimized}
              terminalHeight={terminalHeight}
              terminalSessionId={session.sessionId}
              onResizeMouseDown={handleTerminalResizeMouseDown}
              onClose={() => setTerminalOpen(false)}
              onToggleMinimize={() => setTerminalMinimized(v => !v)}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── KineticWorkspacePage ─────────────────────────────────────────────────────

export function KineticWorkspacePage({ session, onBack }: KineticWorkspacePageProps) {
  type WorkspaceMode = 'detecting' | 'docker-offer' | 'ssh' | 'docker';

  const [mode, setMode] = useState<WorkspaceMode>('detecting');
  const dockerPhase = useDockerDetect(session.sessionId);

  // React to docker detection result
  useEffect(() => {
    if (dockerPhase === 'checking') return;
    if (dockerPhase === 'present') {
      setMode('docker-offer');
    } else {
      // Docker absent, error, or timeout — go straight to SSH workspace
      setMode('ssh');
    }
  }, [dockerPhase]);

  if (mode === 'detecting') {
    return (
      <div className="flex items-center justify-center h-full gap-3">
        <div
          className="w-4 h-4 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
        />
        <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
          Checking server environment…
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Docker detection popup */}
      {mode === 'docker-offer' && (
        <DockerModal
          onManageDocker={() => setMode('docker')}
          onContinueSsh={() => setMode('ssh')}
        />
      )}

      {mode === 'docker' && (
        <DockerWorkspacePlaceholder onBack={() => setMode('ssh')} />
      )}

      {(mode === 'ssh' || mode === 'docker-offer') && (
        <SshWorkspace session={session} onBack={onBack} />
      )}

    </div>
  );
}
