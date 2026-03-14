import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string;
  name: string;
  icon: string;
  total: number; // bytes
  loaded: number; // bytes
  speed?: string;
  eta?: string;
  status: 'active' | 'pending';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function pct(loaded: number, total: number): number {
  if (!total) return 0;
  return Math.round((loaded / total) * 100);
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const INITIAL_QUEUE: QueueItem[] = [
  {
    id: '1',
    name: 'turbine_schematics_rev4.dwg',
    icon: 'description',
    total: 125 * 1024 * 1024,
    loaded: 42.8 * 1024 * 1024,
    speed: '4.2 MB/s',
    eta: '18s',
    status: 'active',
  },
  {
    id: '2',
    name: 'factory_floor_scan_B12.mp4',
    icon: 'video_file',
    total: 712.1 * 1024 * 1024,
    loaded: 612.4 * 1024 * 1024,
    speed: '12.8 MB/s',
    eta: '8s',
    status: 'active',
  },
  {
    id: '3',
    name: 'payload_configs_encrypted.zip',
    icon: 'inventory_2',
    total: 5 * 1024 * 1024,
    loaded: 0,
    status: 'pending',
  },
];

const DESTINATIONS = [
  'root/production/heavy_machinery/assets_v2',
  'root/archive/logistics/2023',
  'root/temp/incoming_payloads',
];

// ─── Component ────────────────────────────────────────────────────────────────

export function UploadPanelPage() {
  const [queue, setQueue] = useState<QueueItem[]>(INITIAL_QUEUE);
  const [destination, setDestination] = useState(DESTINATIONS[0]);
  const [dragging, setDragging] = useState(false);

  const totalBytes = queue.reduce((s, i) => s + i.total, 0);

  const removeItem = (id: string) => setQueue((q) => q.filter((i) => i.id !== id));

  const abortAll = () => setQueue([]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg-base">

      {/* ── Dimmed background area ── */}
      <div className="flex-1 bg-black/60 flex flex-col p-8 gap-6 overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center bg-surface border border-border-muted">
            <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 28 }}>folder_open</span>
          </div>
          <div>
            <h1 className="text-[15px] font-bold tracking-tight text-text-warm uppercase">UniFT Terminal</h1>
            <p className="label text-slate-500">Industrial Node v4.2.0</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6 flex-1">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-recessed border border-border-muted opacity-30" />
          ))}
        </div>
      </div>

      {/* ── Upload Panel (35%) ── */}
      <aside className="w-[35%] min-w-[320px] h-full bg-surface border-l border-border-medium flex flex-col shadow-2xl relative z-10">

        {/* Header */}
        <div className="p-6 border-b border-border-muted flex-shrink-0">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[15px] font-bold tracking-tight flex items-center gap-2 text-text-warm uppercase">
              <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 20 }}>upload_file</span>
              Upload Panel
            </h2>
            <button className="text-slate-500 hover:text-text-warm transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* Destination Folder */}
          <div className="space-y-2">
            <label className="label text-slate-500 block px-1">Destination Node</label>
            <div className="relative">
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full appearance-none depth-input bg-recessed border border-border-muted px-4 py-3 text-[13px] text-slate-300 focus:ring-1 focus:ring-white/20 focus:border-white/30 outline-none transition-all font-mono"
              >
                {DESTINATIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500" style={{ fontSize: 20 }}>expand_more</span>
            </div>
          </div>
        </div>

        {/* Scrollable queue area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">

          {/* Drop Zone */}
          <div
            className={`border-2 border-dashed animate-pulse-border bg-recessed p-12 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all hover:bg-white/[0.02] ${dragging ? 'border-primary/80 bg-primary/5' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); }}
          >
            <div className="w-16 h-16 flex items-center justify-center bg-white/5 border border-border-muted transition-transform hover:scale-105">
              <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 40 }}>box_add</span>
            </div>
            <div className="text-center">
              <p className="text-[15px] font-bold tracking-widest text-primary mb-1">AWAITING PAYLOAD</p>
              <p className="label text-slate-500">Drag-and-drop or click to initialize transfer</p>
            </div>
          </div>

          {/* Queue */}
          {queue.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="label text-slate-500">Upload Queue ({queue.length})</h3>
                <span className="label font-mono text-slate-400 bg-white/5 border border-border-muted px-2 py-0.5">
                  {formatBytes(totalBytes)} TOTAL
                </span>
              </div>

              {queue.map((item) => (
                <div
                  key={item.id}
                  className={`depth-recessed border border-border-muted p-4 space-y-3 ${item.status === 'pending' ? 'opacity-60' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`material-symbols-outlined flex-shrink-0 ${item.status === 'pending' ? 'text-slate-600' : 'text-slate-400'}`}
                        style={{ fontSize: 20 }}
                      >
                        {item.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-slate-200 truncate">{item.name}</p>
                        {item.status === 'active' ? (
                          <p className="label font-mono text-slate-500 truncate">
                            {formatBytes(item.loaded)} / {formatBytes(item.total)} • {item.speed} • ETA: {item.eta}
                          </p>
                        ) : (
                          <p className="label font-mono text-slate-600">{formatBytes(item.total)} • PENDING CONNECTION</p>
                        )}
                      </div>
                    </div>
                    {item.status === 'active' ? (
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-slate-600 hover:text-text-warm transition-colors flex-shrink-0 ml-2"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                      </button>
                    ) : (
                      <span className="material-symbols-outlined text-slate-600 flex-shrink-0 ml-2" style={{ fontSize: 16 }}>hourglass_empty</span>
                    )}
                  </div>

                  {item.status === 'active' && (
                    <div className="w-full bg-white/5 h-[3px] overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${pct(item.loaded, item.total)}%`, boxShadow: '0 0 8px rgba(224,123,57,0.4)' }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-6 bg-recessed border-t border-border-medium grid grid-cols-2 gap-4 flex-shrink-0">
          <button
            onClick={abortAll}
            className="flex items-center justify-center gap-2 h-12 bg-primary text-bg-panel font-mono font-bold label uppercase tracking-widest hover:brightness-110 transition-all shadow-lg"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>cancel</span>
            Abort All
          </button>
          <button className="flex items-center justify-center gap-2 h-12 bg-white/5 border border-border-muted text-text-warm font-mono font-bold label uppercase tracking-widest hover:bg-white/10 transition-all">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>bolt</span>
            Flash Sync
          </button>
        </div>
      </aside>
    </div>
  );
}
