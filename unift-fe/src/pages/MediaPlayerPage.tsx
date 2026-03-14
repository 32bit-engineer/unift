import { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueVideo {
  id: string;
  title: string;
  thumb: string;
  active?: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const QUEUE: QueueVideo[] = [
  { id: '1', title: 'Creative Coding S04', thumb: 'https://picsum.photos/seed/v1/320/180', active: true },
  { id: '2', title: 'Shader Workshop', thumb: 'https://picsum.photos/seed/v2/320/180' },
  { id: '3', title: 'Render Pipeline Talk', thumb: 'https://picsum.photos/seed/v3/320/180' },
  { id: '4', title: 'Color Grading Deep Dive', thumb: 'https://picsum.photos/seed/v4/320/180' },
  { id: '5', title: 'Sound Design Basics', thumb: 'https://picsum.photos/seed/v5/320/180' },
];

const SIDE_CONTROLS = [
  { icon: 'volume_up', title: 'Volume' },
  { icon: 'closed_caption', title: 'Captions' },
  { icon: 'speed', title: 'Speed' },
  { icon: 'fullscreen', title: 'Fullscreen' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function MediaPlayerPage() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(35);
  const [urlValue] = useState('https://unift.io/v/creative-coding-session-04');

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    setProgress(Math.max(0, Math.min(100, pct)));
  };

  const totalSecs = 38 * 60 + 20;
  const currentSecs = Math.round((progress / 100) * totalSecs);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="bg-bg-base text-text-warm min-h-screen flex flex-col overflow-hidden">

      {/* ── Top Navigation / URL Bar ── */}
      <header className="w-full px-8 py-6 flex flex-col items-center gap-6">
        <div className="w-full max-w-4xl flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="text-primary">
              <span className="material-symbols-outlined" style={{ fontSize: 32 }}>rocket_launch</span>
            </div>
            <h2 className="text-[20px] font-semibold tracking-tight text-slate-100">
              UniFT <span className="text-text-warm/40 font-light">Player</span>
            </h2>
          </div>
          <div className="flex gap-4">
            {['settings', 'close'].map((icon) => (
              <button key={icon} className="p-2 hover:bg-white/5 transition-colors text-slate-400 hover:text-text-warm">
                <span className="material-symbols-outlined">{icon}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="w-full max-w-2xl">
          <div className="depth-input bg-black/40 border border-border-muted flex items-center px-4 py-3 gap-3">
            <span className="material-symbols-outlined text-slate-600" style={{ fontSize: 16 }}>link</span>
            <input
              className="bg-transparent border-none focus:ring-0 text-slate-400 font-mono text-[12px] w-full outline-none"
              readOnly
              value={urlValue}
            />
            <span className="material-symbols-outlined text-slate-700" style={{ fontSize: 16 }}>lock</span>
          </div>
        </div>
      </header>

      {/* ── Main Player Area ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 relative">
        <div className="relative w-full max-w-6xl aspect-video overflow-hidden bg-black panel-depth group">
          {/* Placeholder thumbnail */}
          <div
            className="absolute inset-0 bg-cover bg-center opacity-80"
            style={{ background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1208 50%, #0a0a0a 100%)' }}
          />
          {/* Scanline effect */}
          <div className="scanline" />
          {/* Play Overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-24 h-24 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-text-warm flex items-center justify-center hover:scale-105 transition-transform hover:bg-white/10"
            >
              <span
                className="material-symbols-outlined transition-all"
                style={{ fontSize: 48, fontVariationSettings: "'FILL' 1" }}
              >
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>
          </div>
          {/* Video Info Overlay */}
          <div className="absolute top-8 left-8 flex flex-col gap-2">
            <span className="label-o">Now Playing</span>
            <h1 className="text-[36px] lg:text-[54px] font-bold leading-[1.05] tracking-tight text-slate-100">
              Creative Coding Session 04:<br />Generative Textures
            </h1>
          </div>
        </div>

        {/* ── Timeline ── */}
        <div className="w-full max-w-6xl mt-8 px-2">
          <div
            className="relative h-1 bg-white/10 w-full mb-4 overflow-visible cursor-pointer"
            onClick={handleScrub}
          >
            <div className="absolute h-full bg-primary" style={{ width: `${progress}%` }} />
            <div
              className="absolute w-4 h-4 bg-primary -top-1.5 cursor-pointer border-2 border-bg-base transition-transform hover:scale-125"
              style={{ left: `calc(${progress}% - 8px)`, boxShadow: '0 0 15px rgba(224,123,57,0.6)' }}
            />
          </div>
          <div className="flex justify-between items-center text-slate-500 font-mono text-[12px]">
            <span>{fmt(currentSecs)}</span>
            <div className="flex items-center gap-10 text-slate-400">
              <button className="hover:text-text-warm transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>skip_previous</span>
              </button>
              <button className="hover:text-text-warm transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>fast_rewind</span>
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-12 h-12 rounded-full bg-text-warm text-bg-base flex items-center justify-center hover:bg-white transition-colors"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 30, fontVariationSettings: "'FILL' 1" }}
                >
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>
              <button className="hover:text-text-warm transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>fast_forward</span>
              </button>
              <button className="hover:text-text-warm transition-colors">
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>skip_next</span>
              </button>
            </div>
            <span>{fmt(totalSecs)}</span>
          </div>
        </div>
      </main>

      {/* ── Thumbnail Strip / Queue ── */}
      <footer className="w-full py-10 px-8">
        <div className="w-full max-w-6xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between text-slate-500">
            <span className="label flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
              Up Next in Queue
            </span>
            <button className="label hover:text-text-warm transition-colors">View All</button>
          </div>
          <div className="flex gap-4 overflow-x-hidden relative h-32 items-center">
            {QUEUE.map((vid) => (
              <div
                key={vid.id}
                className={`flex-none w-48 aspect-video overflow-hidden relative cursor-pointer group transition-colors ${
                  vid.active
                    ? 'border-2 border-primary shadow-lg'
                    : 'border border-border-muted hover:border-border-medium'
                }`}
                style={vid.active ? { boxShadow: '0 0 20px rgba(224,123,57,0.2)' } : undefined}
              >
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${vid.thumb})`, opacity: 0.7 }}
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="material-symbols-outlined text-text-warm" style={{ fontSize: 24 }}>play_circle</span>
                </div>
                {vid.active && (
                  <div className="absolute bottom-1 left-1">
                    <span className="label-o text-[9px]">PLAYING</span>
                  </div>
                )}
              </div>
            ))}
            {/* Fade out gradient */}
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-bg-base to-transparent pointer-events-none" />
          </div>
        </div>
      </footer>

      {/* ── Side Controls ── */}
      <div className="fixed right-8 top-1/2 -translate-y-1/2 flex flex-col gap-4 p-2 bg-black/40 backdrop-blur-md border border-border-muted panel-depth">
        {SIDE_CONTROLS.map(({ icon, title }) => (
          <button
            key={icon}
            title={title}
            className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-text-warm transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
