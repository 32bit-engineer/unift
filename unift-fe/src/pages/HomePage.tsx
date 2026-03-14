import { useState } from 'react';
import { Badge } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransferRow {
  timestamp: string;
  source: string;
  destination: string;
  file: string;
  size: string;
  status: 'active' | 'done' | 'fail' | 'queue';
  progress: number;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const TRANSFER_ROWS: TransferRow[] = [
  { timestamp: '09:42:11', source: 'LOCAL', destination: 'NAS-STORAGE-02', file: 'render_final_4k.mov', size: '2.1 GB', status: 'active', progress: 65 },
  { timestamp: '09:41:05', source: 'EU-WEST', destination: 'LOCAL', file: 'factory_scan_B12.mp4', size: '450 MB', status: 'fail', progress: 38 },
  { timestamp: '09:38:22', source: 'SRV-PROD-01', destination: 'LOCAL', file: 'backup_full_v2.tar.gz', size: '12.8 GB', status: 'done', progress: 100 },
  { timestamp: '09:35:44', source: 'REMOTE-A', destination: 'LOCAL', file: 'sys_manifest.json', size: '2.1 KB', status: 'done', progress: 100 },
  { timestamp: '09:30:12', source: 'LOCAL', destination: 'INTERNAL-S3', file: 'archive_q4_2024.zip', size: '89.4 GB', status: 'queue', progress: 0 },
];

const COMPARISON_ROWS: {
  cap: string;
  unift: boolean | string;
  nextcloud: boolean | string;
  jellyfin: boolean | string;
  filebrowser: boolean | string;
}[] = [
  { cap: 'Full file ops (CRUD)', unift: true, nextcloud: true, jellyfin: false, filebrowser: true },
  { cap: 'Resumable chunked upload', unift: true, nextcloud: true, jellyfin: false, filebrowser: false },
  { cap: 'Dedicated media player', unift: true, nextcloud: false, jellyfin: true, filebrowser: 'preview only' },
  { cap: 'HLS live stream support', unift: true, nextcloud: false, jellyfin: false, filebrowser: false },
  { cap: 'URL passthrough streaming', unift: true, nextcloud: false, jellyfin: false, filebrowser: false },
  { cap: 'FFmpeg transcoding', unift: true, nextcloud: false, jellyfin: true, filebrowser: false },
  { cap: 'Per-folder access control', unift: true, nextcloud: true, jellyfin: 'partial', filebrowser: true },
  { cap: 'Single Docker image', unift: true, nextcloud: false, jellyfin: true, filebrowser: true },
  { cap: 'Power-user dense UI', unift: true, nextcloud: false, jellyfin: false, filebrowser: false },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 items-center justify-center bg-[#E07B39] flex-shrink-0">
        <span
          className="material-symbols-outlined text-white"
          style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}
        >
          terminal
        </span>
      </div>
      <span className="font-mono text-[15px] font-bold tracking-tight text-[#E8E4DC]">
        UniFT<span className="text-[#E07B39]">//</span>OS
      </span>
    </div>
  );
}

function ProgBar({ pct, variant = 'active' }: { pct: number; variant?: 'active' | 'done' | 'fail' }) {
  const color =
    variant === 'done' ? 'bg-[#5a9e6f]' : variant === 'fail' ? 'bg-[#c03939]' : 'bg-[#E07B39]';
  return (
    <div className="w-32 h-[2px] bg-white/10 overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function CompCell({ val }: { val: boolean | string }) {
  if (val === true)
    return (
      <span className="text-[#E07B39] text-base font-bold">✓</span>
    );
  if (val === false)
    return <span className="text-slate-700 text-base">—</span>;
  return <span className="text-slate-500 text-xs italic">{val}</span>;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function HomePage() {
  const [searchVal, setSearchVal] = useState('');

  return (
    <div className="relative flex min-h-screen flex-col bg-[#1C1E1A] text-[#E8E4DC]">

      {/* ── Top Nav ── */}
      <header className="sticky top-0 z-50 border-b border-[#3a3a34] bg-[#161814]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl h-14 items-center justify-between px-6">
          <div className="flex items-center gap-10">
            <Logo />
            <nav className="hidden gap-6 md:flex">
              {['FILES', 'TRANSFER', 'STREAM', 'ADMIN', 'DOCS'].map((item) => (
                <a
                  key={item}
                  className="font-mono text-[11px] font-bold tracking-widest text-slate-500 hover:text-[#E8E4DC] transition-colors cursor-pointer uppercase"
                >
                  {item}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-8 items-center gap-2 bg-[#161814] border border-[#3a3a34] px-3">
              <span className="material-symbols-outlined text-slate-500" style={{ fontSize: 15 }}>search</span>
              <input
                className="font-mono w-40 border-none bg-transparent text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-0"
                placeholder="Search..."
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
              />
            </div>
            <div className="hidden lg:flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#5a9e6f]" />
              <span className="font-mono text-[11px] text-slate-500 tracking-widest">NODE_ALPHA</span>
            </div>
            <div className="w-8 h-8 rounded bg-[#232620] border border-[#3a3a34] flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 16 }}>person</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow">

        {/* ── Hero ── */}
        <section className="border-b border-[#3a3a34] px-6 py-24">
          <div className="mx-auto max-w-6xl flex flex-col gap-16 lg:flex-row lg:items-start">

            {/* Left copy */}
            <div className="flex flex-1 flex-col gap-8 pt-2">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#E07B39]">SYSTEM READY</span>
                <div className="h-px w-8 bg-[#E07B39]/50" />
                <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">BUILD V2.10.4</span>
              </div>
              <h1 className="text-5xl lg:text-6xl font-bold leading-[1.08] tracking-tight text-[#E8E4DC]">
                Your server.<br />
                One screen.<br />
                <span className="text-[#E07B39]">Full control.</span>
              </h1>
              <p className="text-base leading-relaxed text-slate-400 max-w-lg">
                Browse, transfer, and stream — all on one surface, all at once. Built for the self-hoster who outgrew cloud storage and wants to own every byte.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => { window.location.href = '?page=browser'; }}
                  className="flex h-11 items-center gap-2 bg-[#E07B39] px-6 font-mono text-sm font-bold uppercase tracking-wider text-white hover:brightness-110 transition-all"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>rocket_launch</span>
                  LAUNCH APP
                </button>
                <button className="flex h-11 items-center gap-2 bg-transparent border border-[#3a3a34] px-6 font-mono text-sm font-bold uppercase tracking-wider text-slate-300 hover:bg-white/5 transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>code</span>
                  VIEW SOURCE
                </button>
                <button className="flex h-11 items-center gap-2 bg-transparent border border-[#3a3a34] px-6 font-mono text-sm font-bold uppercase tracking-wider text-slate-300 hover:bg-white/5 transition-colors">
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                  DOCKER PULL
                </button>
              </div>

              {/* Stat strip */}
              <div className="flex flex-wrap gap-10 pt-6 border-t border-[#3a3a34]">
                <div>
                  <div className="font-mono text-3xl font-bold text-[#E8E4DC]">1<span className="text-[#E07B39]">.</span>0</div>
                  <div className="font-mono text-[11px] uppercase tracking-widest text-slate-600 mt-1">DOCKER IMAGE</div>
                </div>
                <div className="h-12 w-px bg-[#3a3a34] self-center" />
                <div>
                  <div className="font-mono text-3xl font-bold text-[#E8E4DC]">3<span className="text-[#E07B39]">-in-</span>1</div>
                  <div className="font-mono text-[11px] uppercase tracking-widest text-slate-600 mt-1">FILES + TRANSFER + STREAM</div>
                </div>
                <div className="h-12 w-px bg-[#3a3a34] self-center" />
                <div>
                  <div className="font-mono text-3xl font-bold text-[#E8E4DC]">AGPL</div>
                  <div className="font-mono text-[11px] uppercase tracking-widest text-slate-600 mt-1">OPEN SOURCE</div>
                </div>
              </div>
            </div>

            {/* Right: Terminal mock */}
            <div className="flex-1 max-w-[580px] w-full">
              <div className="bg-[#161814] border border-[#3a3a34] overflow-hidden shadow-2xl">
                {/* Title bar */}
                <div className="flex items-center justify-between border-b border-[#3a3a34] bg-[#232620] px-4 py-2.5">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                    <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                    <div className="h-2.5 w-2.5 rounded-full bg-slate-700" />
                  </div>
                  <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">ROOT@UNIFT — /home/media/projects</span>
                  <Badge variant="active">LIVE</Badge>
                </div>
                <div className="scanline" />
                {/* Terminal content */}
                <div className="grid font-mono text-xs leading-relaxed" style={{ gridTemplateColumns: '190px 1fr', minHeight: 340 }}>
                  {/* Sidebar tree */}
                  <div className="border-r border-[#3a3a34] bg-[#1a1c18] p-4">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-slate-600 mb-3">FILESYSTEM</div>
                    <div className="space-y-1 text-[12px]">
                      <div className="text-slate-500">▾ <span className="text-slate-300">home/</span></div>
                      <div className="text-slate-500 pl-4">▾ <span className="text-slate-300">media/</span></div>
                      <div className="pl-8 text-slate-400">▸ movies/</div>
                      <div className="pl-8 text-slate-400">▸ music/</div>
                      <div className="pl-8 text-[#E07B39] font-bold">▸ projects/</div>
                      <div className="pl-8 text-slate-400">▸ photos/</div>
                      <div className="text-slate-600 pl-4 mt-1">▸ backups/</div>
                    </div>
                    <div className="h-px bg-[#3a3a34] my-4" />
                    <div className="font-mono text-[10px] uppercase tracking-widest text-slate-600 mb-3">TRANSFERS</div>
                    <div className="space-y-2">
                      <div className="text-[11px] text-slate-400">render_final_4k.mov</div>
                      <div className="h-[2px] bg-white/5 w-full overflow-hidden">
                        <div className="h-full bg-[#E07B39]" style={{ width: '65%' }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-600">
                        <span>65%</span><span>2m14s</span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1">database_dump.sql</div>
                      <div className="h-[2px] bg-white/5 w-full overflow-hidden">
                        <div className="h-full bg-[#5a9e6f]" style={{ width: '100%' }} />
                      </div>
                      <div className="text-[10px] text-[#5a9e6f]">DONE</div>
                    </div>
                  </div>
                  {/* File list */}
                  <div className="p-4">
                    <div className="flex justify-between border-b border-[#3a3a34] pb-2 mb-3 text-[10px] uppercase tracking-widest text-slate-600">
                      <span className="flex-1">Name</span>
                      <span className="w-14 text-right">Size</span>
                      <span className="w-20 text-right">Modified</span>
                    </div>
                    {[
                      { icon: '📄', name: 'hero_render_4k.mov', size: '2.1 GB', date: '11-14', active: false },
                      { icon: '🎞', name: 'assembly_guide.mp4', size: '88 MB', date: '11-05', active: true },
                      { icon: '📋', name: 'project_specs.pdf', size: '2.1 MB', date: '11-04', active: false },
                      { icon: '🗂', name: 'Archive_2023/', size: '—', date: '11-01', active: false },
                      { icon: '📊', name: 'budget_24.xlsx', size: '240 KB', date: '10-31', active: false },
                      { icon: '💾', name: 'demo_reel.mov', size: '154 MB', date: '10-25', active: false },
                    ].map((f) => (
                      <div
                        key={f.name}
                        className={`flex justify-between py-1.5 text-[12px] ${
                          f.active ? 'bg-[#E07B39]/10 text-[#E07B39] px-1' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className="flex-1 flex items-center gap-1.5 truncate min-w-0 mr-2">
                          <span>{f.icon}</span>
                          <span className="truncate">{f.name}</span>
                        </span>
                        <span className={`w-14 text-right flex-shrink-0 ${f.active ? '' : 'text-slate-600'}`}>{f.size}</span>
                        <span className={`w-16 text-right flex-shrink-0 ${f.active ? 'opacity-60' : 'text-slate-700'}`}>{f.date}</span>
                      </div>
                    ))}
                    <div className="mt-4 pt-3 border-t border-[#3a3a34] flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 font-mono">6 items · 2.4 GB</span>
                      <Badge variant="active">1 SELECTED</Badge>
                      <span className="text-slate-600 font-mono">STORAGE 85%</span>
                    </div>
                  </div>
                </div>
                {/* Bottom bar */}
                <div className="border-t border-[#3a3a34] bg-[#232620] px-4 py-2 flex items-center gap-4">
                  <span className="text-[#E07B39] text-xs">●</span>
                  <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">SERVER CONNECTED</span>
                  <div className="h-3 w-px bg-[#3a3a34]" />
                  <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">20 ITEMS</span>
                  <div className="flex-1" />
                  <span className="font-mono text-[11px] text-slate-700">UTF-8</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="border-b border-[#3a3a34] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between mb-12">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-2">PROTOCOL</p>
                <h2 className="text-4xl font-bold text-[#E8E4DC] tracking-tight">Deploy in three commands.</h2>
              </div>
              <span className="font-mono text-xs text-[#E07B39]/40 hidden md:block">01 / HOW IT WORKS</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
              {[
                {
                  num: '01', label: 'PROVISION', title: 'Mount your storage',
                  desc: 'Point UniFT at your HDD partitions. It reads your filesystem directly — no sync, no duplication, no abstraction layer.',
                  lines: ['$ mkdir -p /mnt/hdd1 /mnt/hdd2', '$ mount /dev/sda1 /mnt/hdd1', '✓ Filesystem ready'],
                },
                {
                  num: '02', label: 'DEPLOY', title: 'One Docker command',
                  desc: 'A single image ships the API and the UI together. No separate frontend server, no CORS configuration, no version mismatch.',
                  lines: ['$ docker compose up -d', '# unift + postgres starting...', '✓ Running on :3000'],
                },
                {
                  num: '03', label: 'OPERATE', title: 'Open the browser',
                  desc: "Browse files, drag in uploads, paste a video URL to stream it. Works on any device on your network — or from anywhere via Tailscale.",
                  lines: ['→ http://192.168.1.x:3000', '→ http://100.x.x.x:3000 (VPN)', '✓ Command centre ready'],
                },
              ].map((step) => (
                <div key={step.num} className="bg-[#161814] border border-[#3a3a34] p-8 relative">
                  <div className="font-mono text-[64px] font-bold text-[#E07B39]/8 absolute top-4 right-6 leading-none select-none pointer-events-none">{step.num}</div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-4">{step.label}</p>
                  <h3 className="text-xl font-bold text-[#E8E4DC] mb-3">{step.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed mb-6">{step.desc}</p>
                  <div className="bg-[#131511] border border-[#3a3a34] p-4 font-mono text-sm text-slate-400 space-y-1">
                    {step.lines.map((line, i) => (
                      <div key={i} className={line.startsWith('✓') ? 'text-[#E07B39]' : ''}>
                        {line.startsWith('$') || line.startsWith('→') ? (
                          <><span className="text-slate-600">{line[0]}</span>{line.slice(1)}</>
                        ) : line}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Three Engines ── */}
        <section className="border-b border-[#3a3a34] px-6 py-20 bg-[#232620]/20">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between mb-12">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-2">CAPABILITIES</p>
                <h2 className="text-4xl font-bold text-[#E8E4DC] tracking-tight">Three engines. One interface.</h2>
              </div>
              <span className="font-mono text-xs text-[#E07B39]/40 hidden md:block">02 / FEATURES</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-1 mb-1">
              {/* File Ops */}
              <div className="bg-[#1e2019] border border-[#3a3a34] p-8 hover:border-[#E07B39]/30 transition-colors group">
                <div className="flex items-start gap-4 mb-6">
                  <div className="flex h-12 w-12 items-center justify-center bg-[#161814] border border-[#3a3a34] text-slate-500 group-hover:text-[#E07B39] transition-colors flex-shrink-0">
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>folder_open</span>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-1">ENGINE 01</p>
                    <h3 className="text-xl font-bold text-[#E8E4DC]">File Operations</h3>
                  </div>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                  A complete filesystem interface. Not a sync client, not a cloud drive — direct access to your server's folders with every operation you'd expect from a native file manager.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {['Create / Rename / Move', 'Bulk operations', 'Download as ZIP', 'Soft delete (trash)', 'File metadata + EXIF', 'Recursive search'].map((f) => (
                    <div key={f} className="bg-[#161814] border border-[#3a3a34] p-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#E07B39] flex-shrink-0" style={{ fontSize: 15 }}>check_small</span>
                      <span className="text-sm text-slate-400">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transfer */}
              <div className="bg-[#1e2019] border border-[#3a3a34] p-8 hover:border-[#E07B39]/30 transition-colors group">
                <div className="flex items-start gap-4 mb-6">
                  <div className="flex h-12 w-12 items-center justify-center bg-[#161814] border border-[#3a3a34] text-slate-500 group-hover:text-[#E07B39] transition-colors flex-shrink-0">
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>upload_file</span>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-1">ENGINE 02</p>
                    <h3 className="text-xl font-bold text-[#E8E4DC]">File Transfer</h3>
                  </div>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                  Chunked, resumable transfers from any device. Drop a file from your phone, paste a remote URL, or push from another server — it all lands in the right place.
                </p>
                <div className="bg-[#161814] border border-[#3a3a34] p-5 space-y-4">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-slate-600 mb-1">TRANSFER QUEUE</p>
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-slate-300 font-mono truncate mr-4">hero_render_final_4k.mov</span>
                      <span className="text-[#E07B39] font-mono flex-shrink-0">65% · 12.8 MB/s</span>
                    </div>
                    <div className="h-[2px] bg-white/10 overflow-hidden">
                      <div className="h-full bg-[#E07B39]" style={{ width: '65%' }} />
                    </div>
                    <div className="flex justify-between text-xs mt-1 text-slate-600 font-mono">
                      <span>1.4 GB / 2.1 GB</span><span>ETA 1m 14s</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-slate-500 font-mono">database_backup.sql</span>
                      <span className="text-slate-600 font-mono">QUEUED</span>
                    </div>
                    <div className="h-[2px] bg-white/10" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 font-mono">config_bundle.zip</span>
                      <span className="text-slate-700 font-mono text-xs">PENDING</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Streaming (full width) */}
            <div className="bg-[#1e2019] border border-[#3a3a34] p-8 hover:border-[#E07B39]/30 transition-colors group">
              <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center bg-[#161814] border border-[#3a3a34] text-slate-500 group-hover:text-[#E07B39] transition-colors flex-shrink-0">
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>play_circle</span>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-1">ENGINE 03</p>
                    <h3 className="text-xl font-bold text-[#E8E4DC]">Media Streaming</h3>
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-600">FFmpeg + yt-dlp powered</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div>
                  <p className="text-sm text-slate-400 leading-relaxed mb-5">
                    One player for everything. Stored files, external URLs, HLS live streams — paste anything and it plays. Format is never a blocker.
                  </p>
                  <div className="space-y-2.5">
                    {['HTTP range requests — full seek support', 'HLS live stream relay', 'FFmpeg transcoding fallback', 'YouTube / platform URL support', 'Subtitle auto-detection (.srt/.vtt)', 'Quality selector (1080p / 720p / 480p)'].map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm text-slate-400">
                        <span className="material-symbols-outlined text-[#E07B39] flex-shrink-0" style={{ fontSize: 15 }}>check_small</span>
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'STORED FILE', path: '/mnt/hdd2/movies/inception.mkv', badge: 'done' as const, badgeText: 'DIRECT PLAY', note: 'No transcoding. Streamed at full quality via HTTP range requests.' },
                    { label: 'EXTERNAL URL', path: 'https://cdn.example.com/video.mp4', badge: 'info' as const, badgeText: 'PROXY STREAM', note: "Server fetches and relays. Client never contacts the source directly." },
                    { label: 'HLS STREAM', path: 'https://live.example.com/stream.m3u8', badge: 'active' as const, badgeText: 'LIVE RELAY', note: 'Segments rewritten through the proxy. Access control applied uniformly.' },
                    { label: 'UNSUPPORTED FORMAT', path: '/media/raw_footage.braw', badge: 'queue' as const, badgeText: 'TRANSCODE', note: 'FFmpeg converts to H.264/AAC on the fly. Hardware acceleration optional.' },
                  ].map((item) => (
                    <div key={item.label} className="bg-[#161814] border border-[#3a3a34] p-5">
                      <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-2">{item.label}</p>
                      <p className="font-mono text-xs text-slate-500 mb-3 truncate">{item.path}</p>
                      <Badge variant={item.badge}>{item.badgeText}</Badge>
                      <p className="text-xs text-slate-500 mt-3 leading-relaxed">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Access Control ── */}
        <section className="border-b border-[#3a3a34] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between mb-12">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-2">SECURITY</p>
                <h2 className="text-4xl font-bold text-[#E8E4DC] tracking-tight">Private by design.</h2>
              </div>
              <span className="font-mono text-xs text-[#E07B39]/40 hidden md:block">03 / ACCESS CONTROL</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              <div>
                <p className="text-base text-slate-400 leading-relaxed mb-8">
                  Every folder has a role. Admin sees everything including private folders. Users see only what they're allowed to. The private{' '}
                  <span className="font-mono text-[#E07B39]">fmpr</span> folder never appears to anyone else — not even as an empty entry.
                </p>
                <div className="space-y-3">
                  {[
                    { icon: 'lock', title: 'JWT with RS256 signing', desc: 'Asymmetric keys — private key never leaves your server' },
                    { icon: 'shield', title: 'Path traversal protection', desc: 'Every file path validated and normalised server-side before any I/O' },
                    { icon: 'verified_user', title: 'SSRF protection on URL streaming', desc: 'Private IP ranges blocked — your internal network stays internal' },
                    { icon: 'sms', title: 'SMS OTP password reset', desc: 'Phone-verified reset — no email dependency required' },
                  ].map((item) => (
                    <div key={item.title} className="flex items-start gap-4 bg-[#161814] border border-[#3a3a34] p-4">
                      <span className="material-symbols-outlined text-[#E07B39] flex-shrink-0 mt-0.5" style={{ fontSize: 20 }}>{item.icon}</span>
                      <div>
                        <div className="text-sm font-semibold text-[#E8E4DC] mb-0.5">{item.title}</div>
                        <div className="text-sm text-slate-500">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Permissions table mock */}
              <div className="bg-[#161814] border border-[#3a3a34] overflow-hidden">
                <div className="border-b border-[#3a3a34] bg-[#232620] px-5 py-3 flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">FOLDER PERMISSIONS</span>
                  <Badge variant="done">INTEGRITY PASS</Badge>
                </div>
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="border-b border-[#3a3a34]">
                      <th className="px-5 py-3 text-left text-[11px] uppercase tracking-widest text-slate-600 font-bold">PATH</th>
                      <th className="px-5 py-3 text-left text-[11px] uppercase tracking-widest text-slate-600 font-bold">ROLE</th>
                      <th className="px-5 py-3 text-center text-[11px] uppercase tracking-widest text-slate-600 font-bold">R</th>
                      <th className="px-5 py-3 text-center text-[11px] uppercase tracking-widest text-slate-600 font-bold">W</th>
                      <th className="px-5 py-3 text-center text-[11px] uppercase tracking-widest text-slate-600 font-bold">X</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[
                      { path: '🔒 /fmpr', badge: 'fail' as const, role: 'ADMIN ONLY', r: true, w: true, x: true },
                      { path: '/movies', badge: 'done' as const, role: 'ALL USERS', r: true, w: false, x: false },
                      { path: '/tvshows', badge: 'done' as const, role: 'ALL USERS', r: true, w: false, x: false },
                      { path: '/music', badge: 'done' as const, role: 'ALL USERS', r: true, w: false, x: false },
                      { path: '/photos', badge: 'done' as const, role: 'ALL USERS', r: true, w: false, x: false },
                    ].map((row) => (
                      <tr key={row.path} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3.5 text-slate-300">{row.path}</td>
                        <td className="px-5 py-3.5"><Badge variant={row.badge}>{row.role}</Badge></td>
                        <td className="px-5 py-3.5 text-center text-[#E07B39] font-bold">{row.r ? '✓' : <span className="text-slate-700">—</span>}</td>
                        <td className="px-5 py-3.5 text-center">{row.w ? <span className="text-[#E07B39] font-bold">✓</span> : <span className="text-slate-700">—</span>}</td>
                        <td className="px-5 py-3.5 text-center">{row.x ? <span className="text-[#E07B39] font-bold">✓</span> : <span className="text-slate-700">—</span>}</td>
                      </tr>
                    ))}
                    <tr className="bg-[#E07B39]/5">
                      <td className="px-5 py-3 text-slate-600 text-xs italic">+ add directory...</td>
                      <td colSpan={4} className="px-5 py-3"><Badge variant="queue">INHERIT</Badge></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* ── Transfer Log ── */}
        <section className="border-b border-[#3a3a34] px-6 py-20 bg-[#232620]/20">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between mb-10">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-2 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#E07B39] animate-pulse inline-block" />
                  LIVE FEED
                </p>
                <h2 className="text-4xl font-bold text-[#E8E4DC] tracking-tight">Transfer engine — active sessions</h2>
              </div>
              <span className="font-mono text-xs text-[#E07B39]/40 hidden md:block">04 / TRANSFER LOG</span>
            </div>
            <div className="bg-[#161814] border border-[#3a3a34] overflow-x-auto">
              <table className="w-full text-left font-mono">
                <thead>
                  <tr className="border-b border-[#3a3a34] bg-[#232620]">
                    {['TIMESTAMP', 'SOURCE', 'DESTINATION', 'FILE', 'SIZE', 'STATUS', 'PROGRESS'].map((h) => (
                      <th key={h} className={`px-5 py-3.5 text-[11px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap ${h === 'SIZE' ? 'text-right' : h === 'STATUS' ? 'text-center' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3a3a34]/40">
                  {TRANSFER_ROWS.map((row) => (
                    <tr key={row.timestamp} className={`hover:bg-white/[0.02] ${row.status === 'active' ? 'bg-[#E07B39]/5' : ''}`}>
                      <td className="px-5 py-4 text-sm text-slate-500">{row.timestamp}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{row.source}</td>
                      <td className="px-5 py-4 text-sm text-slate-400">{row.destination}</td>
                      <td className={`px-5 py-4 text-sm ${row.status === 'active' ? 'text-[#E8E4DC]' : 'text-slate-400'}`}>{row.file}</td>
                      <td className="px-5 py-4 text-sm text-right text-slate-400">{row.size}</td>
                      <td className="px-5 py-4 text-center">
                        <Badge variant={row.status}>{row.status.toUpperCase()}</Badge>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <ProgBar pct={row.progress} variant={row.status === 'done' ? 'done' : row.status === 'fail' ? 'fail' : 'active'} />
                          <span className={`text-sm ${row.status === 'active' ? 'text-[#E07B39]' : row.status === 'fail' ? 'text-[#c03939]' : 'text-slate-500'}`}>
                            {row.progress}%
                          </span>
                          {row.status === 'fail' && (
                            <button className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] hover:underline">RETRY</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-8 mt-5 pt-5 border-t border-[#3a3a34]">
              <div><span className="font-mono text-[11px] uppercase tracking-widest text-slate-600">UPTIME </span><span className="font-mono text-sm text-slate-300">42D 11H 05M</span></div>
              <div><span className="font-mono text-[11px] uppercase tracking-widest text-slate-600">TOTAL TRAFFIC </span><span className="font-mono text-sm text-slate-300">184.22 TB</span></div>
              <div><span className="font-mono text-[11px] uppercase tracking-widest text-slate-600">ACTIVE SESSIONS </span><span className="font-mono text-sm text-[#E07B39]">1</span></div>
              <div className="flex-1" />
              <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#5a9e6f]" /><span className="font-mono text-[11px] uppercase tracking-widest text-slate-600">DB CONNECTED</span></div>
              <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#5a9e6f]" /><span className="font-mono text-[11px] uppercase tracking-widest text-slate-600">API ONLINE</span></div>
            </div>
          </div>
        </section>

        {/* ── Comparison ── */}
        <section className="border-b border-[#3a3a34] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between mb-10">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-2">POSITIONING</p>
                <h2 className="text-4xl font-bold text-[#E8E4DC] tracking-tight">Why not just use what exists?</h2>
              </div>
              <span className="font-mono text-xs text-[#E07B39]/40 hidden md:block">05 / COMPARISON</span>
            </div>
            <div className="bg-[#161814] border border-[#3a3a34] overflow-x-auto">
              <table className="w-full font-mono">
                <thead>
                  <tr className="border-b border-[#3a3a34] bg-[#232620]">
                    <th className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-500">CAPABILITY</th>
                    <th className="px-5 py-3.5 text-center text-[11px] font-bold uppercase tracking-widest text-[#E07B39]">UNIFT</th>
                    {['NEXTCLOUD', 'JELLYFIN', 'FILEBROWSER'].map((h) => (
                      <th key={h} className="px-5 py-3.5 text-center text-[11px] font-bold uppercase tracking-widest text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3a3a34]/40">
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.cap} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-4 text-sm text-slate-400">{row.cap}</td>
                      <td className="px-5 py-4 text-center"><CompCell val={row.unift} /></td>
                      <td className="px-5 py-4 text-center"><CompCell val={row.nextcloud} /></td>
                      <td className="px-5 py-4 text-center"><CompCell val={row.jellyfin} /></td>
                      <td className="px-5 py-4 text-center"><CompCell val={row.filebrowser} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className="border-b border-[#3a3a34] px-6 py-20 bg-[#232620]/20">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between mb-12">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-2">LICENSING</p>
                <h2 className="text-4xl font-bold text-[#E8E4DC] tracking-tight">Own it. Host it. Scale it.</h2>
              </div>
              <span className="font-mono text-xs text-[#E07B39]/40 hidden md:block">06 / PRICING</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-1">

              {/* Community */}
              <div className="bg-[#1e2019] border border-[#3a3a34] p-8">
                <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-2">COMMUNITY</p>
                <div className="font-mono text-5xl font-bold text-[#E8E4DC] leading-none mt-3">FREE</div>
                <div className="font-mono text-[11px] uppercase tracking-widest text-slate-500 mt-2">SELF-HOSTED · AGPL</div>
                <div className="h-px bg-[#3a3a34] my-6" />
                <div className="space-y-3 mb-8">
                  {['All file operations', 'Chunked resumable upload', 'Full media streaming', '2 roles (admin / user)', 'Community support'].map((f) => (
                    <div key={f} className="flex items-center gap-3 text-sm text-slate-300">
                      <span className="text-[#E07B39] flex-shrink-0">✓</span> {f}
                    </div>
                  ))}
                  {['SSO / LDAP', 'Audit logs', 'SLA'].map((f) => (
                    <div key={f} className="flex items-center gap-3 text-sm text-slate-600">
                      <span>—</span> {f}
                    </div>
                  ))}
                </div>
                <button className="w-full h-11 bg-transparent border border-[#3a3a34] font-mono text-sm font-bold uppercase tracking-wider text-slate-300 hover:bg-white/5 transition-colors">
                  CLONE ON GITHUB
                </button>
              </div>

              {/* Enterprise (featured) */}
              <div className="relative p-8 bg-[#1e2019] border border-[#E07B39]/40">
                <div className="absolute -top-px left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-widest bg-[#E07B39] text-white px-3 py-1 font-bold uppercase">
                  RECOMMENDED
                </div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mt-4 mb-2">ENTERPRISE</p>
                <div className="font-mono text-5xl font-bold text-[#E8E4DC] leading-none mt-3">
                  $8K<span className="text-2xl text-slate-500">/yr</span>
                </div>
                <div className="font-mono text-[11px] uppercase tracking-widest text-slate-500 mt-2">SELF-HOSTED · COMMERCIAL LICENCE</div>
                <div className="h-px my-6" style={{ background: 'rgba(224,123,57,.25)' }} />
                <div className="space-y-3 mb-8">
                  {['Everything in Community', 'Up to 100 users', 'LDAP / Active Directory', 'Full audit logs', 'Priority email + phone support', '99.9% uptime SLA', 'No AGPL obligations', 'Custom branding'].map((f) => (
                    <div key={f} className="flex items-center gap-3 text-sm text-slate-300">
                      <span className="text-[#E07B39] flex-shrink-0">✓</span> {f}
                    </div>
                  ))}
                </div>
                <button className="w-full h-11 bg-[#E07B39] font-mono text-sm font-bold uppercase tracking-wider text-white hover:brightness-110 transition-all">
                  GET LICENCE
                </button>
              </div>

              {/* Cloud */}
              <div className="bg-[#1e2019] border border-[#3a3a34] p-8">
                <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-2">CLOUD</p>
                <div className="font-mono text-5xl font-bold text-[#E8E4DC] leading-none mt-3">
                  $49<span className="text-2xl text-slate-500">/mo</span>
                </div>
                <div className="font-mono text-[11px] uppercase tracking-widest text-slate-500 mt-2">HOSTED BY UNIFT</div>
                <div className="h-px bg-[#3a3a34] my-6" />
                <div className="space-y-3 mb-8">
                  {['Everything in Community', '1 TB storage', 'Up to 10 users', 'Custom domain', 'Automated backups', 'Priority support'].map((f) => (
                    <div key={f} className="flex items-center gap-3 text-sm text-slate-300">
                      <span className="text-[#E07B39] flex-shrink-0">✓</span> {f}
                    </div>
                  ))}
                  {['LDAP integration', 'Audit logs'].map((f) => (
                    <div key={f} className="flex items-center gap-3 text-sm text-slate-600">
                      <span>—</span> {f}
                    </div>
                  ))}
                </div>
                <button className="w-full h-11 bg-transparent border border-[#3a3a34] font-mono text-sm font-bold uppercase tracking-wider text-slate-300 hover:bg-white/5 transition-colors">
                  JOIN WAITLIST
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Open Source CTA ── */}
        <section className="border-b border-[#3a3a34] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="bg-[#161814] border border-[#3a3a34] p-10 lg:p-16 flex flex-col lg:flex-row lg:items-center gap-12">
              <div className="flex-1">
                <p className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39] mb-4">OPEN SOURCE</p>
                <h2 className="text-4xl font-bold text-[#E8E4DC] tracking-tight leading-tight mb-5">
                  Built in public.<br />Deployed on your hardware.
                </h2>
                <p className="text-base text-slate-400 leading-relaxed max-w-lg">
                  UniFT is AGPL-licensed. The code is auditable, the deployment is yours, and the data never leaves your server. Read every line, run every test, own every byte.
                </p>
              </div>
              <div className="flex flex-col gap-3 min-w-[280px]">
                {[
                  { icon: 'code', title: 'Source on GitHub', sub: 'github.com/unift/unift' },
                  { icon: 'deployed_code', title: 'Docker Hub', sub: 'docker pull unift/unift' },
                  { icon: 'description', title: 'Documentation', sub: 'docs.unift.dev' },
                ].map((item) => (
                  <div key={item.title} className="bg-[#232620] border border-[#3a3a34] p-4 flex items-center gap-4 cursor-pointer hover:bg-[#2a2d26] transition-colors">
                    <span className="material-symbols-outlined text-[#E07B39] flex-shrink-0" style={{ fontSize: 20 }}>{item.icon}</span>
                    <div>
                      <div className="text-sm font-semibold text-[#E8E4DC]">{item.title}</div>
                      <div className="font-mono text-xs text-slate-500 mt-0.5">{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[#3a3a34] bg-[#161814] px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <Logo />
            <div className="h-4 w-px bg-[#3a3a34]" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">V2.10.4-STABLE</span>
            <span className="h-1 w-1 rounded-full bg-[#E07B39]" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[#E07B39]">PROTOCOL ACTIVE</span>
          </div>
          <div className="flex flex-wrap gap-6">
            {['GITHUB', 'DOCS', 'SUPPORT', 'LICENSING', 'CHANGELOG'].map((link) => (
              <a key={link} className="font-mono text-[11px] uppercase tracking-widest text-slate-500 hover:text-[#E8E4DC] transition-colors cursor-pointer">{link}</a>
            ))}
          </div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-slate-600">© 2024 UNIFT SYSTEMS — AGPL v3</div>
        </div>
      </footer>

    </div>
  );
}
