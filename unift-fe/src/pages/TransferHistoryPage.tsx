import { useState } from 'react';
import { Badge } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type TransferAction = 'UPLOAD' | 'DOWNLOAD' | 'SYNC' | 'TRANSFER';
type TransferStatus = 'done' | 'fail' | 'active';

interface HistoryRow {
  id: string;
  timestamp: string;
  action: TransferAction;
  target: string;
  ip?: string;
  size: string;
  status: TransferStatus;
  result: string;
  progress?: number;
  error?: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_ROWS: HistoryRow[] = [
  { id: '1', timestamp: '2023-11-20 09:42:11.402', action: 'UPLOAD',   target: 'US-EAST-DATACENTER-04', size: '1.42 GB',  status: 'done',   result: '[OK] COMPLETED' },
  { id: '2', timestamp: '2023-11-20 09:41:05.118', action: 'DOWNLOAD', target: 'EU-WEST-MIRROR-EDGE',   size: '450.0 MB', status: 'fail',   result: '[ERR] FAILED_TIMEOUT', error: true },
  { id: '3', timestamp: '2023-11-20 09:38:22.001', action: 'SYNC',     target: 'STORAGE_CLUSTER_B',     size: '12.84 TB', status: 'done',   result: '[OK] COMPLETED' },
  { id: '4', timestamp: '2023-11-20 09:37:12.441', action: 'TRANSFER', target: 'US-WEST-RELAY-02',      size: '8.42 GB',  status: 'active', result: 'SENDING', progress: 42 },
  { id: '5', timestamp: '2023-11-20 09:35:44.892', action: 'UPLOAD',   target: '10.0.4.122',            ip: '10.0.4.122', size: '2.1 KB',   status: 'fail',   result: '[ERR] AUTH_DENIED', error: true },
  { id: '6', timestamp: '2023-11-20 09:30:12.110', action: 'DOWNLOAD', target: 'INTERNAL_BACKUP_S3',    size: '89.4 GB',  status: 'done',   result: '[OK] COMPLETED' },
];

const DATE_OPTS = ['Date: Last 24 Hours', 'Date: Last 7 Days', 'Date: All Time'];
const STATUS_OPTS = ['Status: All Results', 'Status: Completed', 'Status: Failed'];

// ─── Component ────────────────────────────────────────────────────────────────

export function TransferHistoryPage() {
  const [dateFilter, setDateFilter] = useState(DATE_OPTS[0]);
  const [statusFilter, setStatusFilter] = useState(STATUS_OPTS[0]);
  const [ipFilter, setIpFilter] = useState('');

  const filtered = MOCK_ROWS.filter((row) => {
    if (statusFilter === 'Status: Completed' && row.status !== 'done') return false;
    if (statusFilter === 'Status: Failed' && row.status !== 'fail') return false;
    if (ipFilter && !row.target.toLowerCase().includes(ipFilter.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="bg-bg-base text-text-warm min-h-screen flex flex-col">

      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-border-muted bg-bg-base px-6 py-4 sticky top-0 z-50" style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 bg-surface border border-border-muted">
            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 22 }}>hub</span>
          </div>
          <div>
            <h1 className="text-[20px] font-bold tracking-tight text-text-warm leading-none">
              UniFT <span className="text-slate-500 font-light ml-2 text-[14px] uppercase tracking-widest">Protocol</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-1 label text-slate-500">
            <span className="w-2 h-2 rounded-full bg-status-ok" />
            NODE_ALPHA_ACTIVE
          </div>
          <div className="flex gap-2">
            {['notifications', 'settings'].map((icon) => (
              <button key={icon} className="flex w-10 h-10 items-center justify-center bg-white/5 hover:bg-white/10 text-slate-400 transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
              </button>
            ))}
          </div>
          <div className="h-10 w-[1px] bg-border-muted" />
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-[12px] font-medium text-text-warm leading-none">ADMIN_ROOT</p>
              <p className="label text-slate-500 mt-1">192.168.1.104</p>
            </div>
            <div className="w-10 h-10 bg-surface border border-border-muted flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-500" style={{ fontSize: 18 }}>person</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Filter bar ── */}
      <div className="bg-bg-base border-b border-border-muted px-6 py-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-500" style={{ fontSize: 16 }}>calendar_today</span>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-surface border border-border-muted text-slate-300 label px-3 py-1.5 focus:ring-1 focus:ring-slate-500 outline-none"
          >
            {DATE_OPTS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-slate-500" style={{ fontSize: 16 }}>filter_list</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface border border-border-muted text-slate-300 label px-3 py-1.5 focus:ring-1 focus:ring-slate-500 outline-none"
          >
            {STATUS_OPTS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 grow max-w-md">
          <span className="material-symbols-outlined text-slate-500" style={{ fontSize: 16 }}>terminal</span>
          <input
            value={ipFilter}
            onChange={(e) => setIpFilter(e.target.value)}
            className="w-full bg-surface border border-border-muted text-slate-300 label px-3 py-1.5 focus:ring-1 focus:ring-slate-500 outline-none placeholder:text-slate-600"
            placeholder="Filter by IP Address or Target..."
          />
        </div>
        <div className="ml-auto flex items-center gap-4">
          <p className="label text-slate-500 uppercase tracking-tighter hidden md:block">Live Stream Enabled</p>
          <button className="bg-white/10 text-slate-300 border border-border-muted px-4 py-1.5 label font-bold flex items-center gap-2 hover:bg-white/20 transition-all">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
            REFRESH_LOGS
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <main className="flex-1 overflow-x-auto custom-scrollbar">
        <table className="w-full border-collapse font-mono">
          <thead>
            <tr className="bg-bg-base text-slate-500 border-b border-border-muted">
              {['Timestamp', 'Action', 'Target Node', 'Payload Size', 'Final Result', 'Ops'].map((h, i) => (
                <th key={h} className={`px-6 py-4 label font-medium ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-[11px] text-slate-300">
            {filtered.map((row, i) => (
              <tr
                key={row.id}
                className={`border-b border-border-muted hover:bg-white/5 transition-colors ${i % 2 === 0 ? 'bg-bg-base' : 'bg-surface/40'} ${row.error ? 'border-l-4 border-l-status-err' : ''}`}
              >
                <td className="px-6 py-4 text-slate-500">{row.timestamp}</td>
                <td className="px-6 py-4">
                  <span className="bg-white/5 text-slate-400 px-2 py-0.5 label font-bold border border-border-muted">{row.action}</span>
                </td>
                <td className="px-6 py-4 text-slate-200">{row.target}</td>
                <td className="px-6 py-4 text-slate-400">{row.size}</td>
                <td className="px-6 py-4">
                  {row.status === 'active' && row.progress !== undefined ? (
                    <div className="w-full max-w-[120px]">
                      <div className="flex items-center justify-between label mb-1 text-primary">
                        <span>SENDING</span>
                        <span>{row.progress}%</span>
                      </div>
                      <div className="w-full h-[2px] bg-white/10 overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${row.progress}%` }} />
                      </div>
                    </div>
                  ) : row.status === 'fail' ? (
                    <div className="flex items-center gap-2 text-status-err font-bold">
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
                      {row.result}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-text-warm font-medium italic opacity-70">
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
                      {row.result}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {row.error ? (
                    <button className="bg-primary text-bg-panel px-3 py-1 label font-bold transition-all flex items-center gap-1 ml-auto hover:brightness-110">
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>replay</span>
                      RETRY_TASK
                    </button>
                  ) : (
                    <button className="text-slate-600 hover:text-slate-400 transition-colors">
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>info</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>

      {/* ── Footer ── */}
      <footer
        className="bg-bg-base border-t border-border-muted px-6 py-2 flex items-center justify-between label text-slate-500 uppercase tracking-widest"
        style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}
      >
        <div className="flex gap-4 flex-wrap">
          <span>System Uptime: 42d 11h 05m</span>
          <span>Total Traffic: 184.22 TB</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-status-ok" /> DB_CONNECTED</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-status-ok" /> API_ONLINE</span>
          <span className="text-slate-300 font-bold border-l border-border-muted pl-4 ml-2">v2.10.4-STABLE</span>
        </div>
      </footer>
    </div>
  );
}
