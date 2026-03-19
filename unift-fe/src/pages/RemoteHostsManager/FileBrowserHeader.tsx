import React from 'react';
import { Icon } from './shared';

interface BreadcrumbSegment {
  label: string;
  index: number;
}

interface FileBrowserHeaderProps {
  breadcrumbSegments: BreadcrumbSegment[];
  pathInputValue: string;
  loading: boolean;
  onClose: () => void;
  onBreadcrumbClick: (index: number) => void;
  onPathInputChange: (value: string) => void;
  onPathInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onNavigateToPath: () => void;
  onRefresh: () => void;
}

export function FileBrowserHeader({
  breadcrumbSegments,
  pathInputValue,
  loading,
  onClose,
  onBreadcrumbClick,
  onPathInputChange,
  onPathInputKeyDown,
  onNavigateToPath,
  onRefresh,
}: FileBrowserHeaderProps) {
  return (
    <div className="h-14 bg-[#1E2130] border-b border-[#2E3348] px-4 flex items-center gap-3 shrink-0">
      {/* Back button */}
      <button
        onClick={onClose}
        className="p-1.5 hover:bg-white/5 rounded transition-colors cursor-pointer"
        title="Back to sessions"
      >
        <Icon name="arrow_back" className="text-slate-400 text-lg" />
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 overflow-x-auto shrink-0" style={{ maxWidth: '35%' }}>
        {breadcrumbSegments.map((seg, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevron_right" className="text-slate-600 text-sm shrink-0" />}
            <button
              onClick={() => onBreadcrumbClick(seg.index)}
              className={`text-xs font-mono whitespace-nowrap px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0 ${
                i === breadcrumbSegments.length - 1
                  ? 'text-[#E2E8F0]'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {seg.label}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Path input — type an absolute path and press Enter */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <input
          type="text"
          value={pathInputValue}
          onChange={e => onPathInputChange(e.target.value)}
          onKeyDown={onPathInputKeyDown}
          className="flex-1 bg-[#11141C] border border-[#2E3348] rounded px-2 py-1 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all"
          placeholder="/path/to/directory"
          title="Type a directory path and press Enter to navigate"
        />
        <button
          onClick={onNavigateToPath}
          className="p-1.5 hover:bg-white/5 rounded transition-colors cursor-pointer shrink-0"
          title="Go to path"
        >
          <Icon name="east" className="text-slate-400 text-base" />
        </button>
      </div>

      {/* Refresh */}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="p-1.5 hover:bg-white/5 rounded transition-colors cursor-pointer disabled:opacity-40"
        title="Refresh"
      >
        <Icon name="refresh" className={`text-slate-400 text-base ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
