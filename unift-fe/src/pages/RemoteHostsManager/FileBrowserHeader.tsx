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
  /** Permissions string for the current directory (e.g. drwxr-xr-x) */
  currentDirPerms?: string;
  /** Called to show/hide the workspace explorer tree panel */
  onToggleTree?: () => void;
  /** Whether the tree is currently visible */
  showTree?: boolean;
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
  currentDirPerms,
  onToggleTree,
  showTree,
}: FileBrowserHeaderProps) {
  return (
    <div
      className="h-11 flex items-center justify-between px-4 shrink-0 border-b border-[#1E1E2E]"
      style={{ background: '#0F0F1A' }}
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-0.5 overflow-x-auto shrink-0">
        {breadcrumbSegments.map((seg, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <span className="text-muted select-none px-0.5 text-meta">&gt;</span>
            )}
            <button
              onClick={() => onBreadcrumbClick(seg.index)}
              className={`text-meta px-1.5 py-0.5 rounded whitespace-nowrap cursor-pointer transition-colors ${
                i === breadcrumbSegments.length - 1
                  ? 'text-primary'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              {i === 0 ? (
                <span className="material-symbols-rounded" style={{ fontSize: '14px', verticalAlign: 'middle' }}>
                  home
                </span>
              ) : seg.label}
            </button>
          </React.Fragment>
        ))}
      </nav>

      {/* Right: path input + controls */}
      <div className="flex items-center gap-2 flex-1 justify-end min-w-0 ml-4">
        {currentDirPerms && (
          <span className="text-micro text-muted px-2 py-0.5 rounded border border-[#1E1E2E] bg-[#171724] shrink-0">
            {currentDirPerms}
          </span>
        )}
        <div className="flex items-center bg-[#1E2235] border border-[#1E1E2E] rounded overflow-hidden min-w-0 max-w-xs flex-1">
          <input
            type="text"
            value={pathInputValue}
            onChange={e => onPathInputChange(e.target.value)}
            onKeyDown={onPathInputKeyDown}
            className="flex-1 bg-transparent px-3 py-1 text-code text-secondary placeholder:text-muted outline-none min-w-0"
            placeholder="/path/to/directory"
            title="Type a path and press Enter"
          />
          <button
            onClick={onNavigateToPath}
            className="px-2 py-1 hover:bg-white/5 cursor-pointer transition-colors border-l border-[#1E1E2E]"
            title="Go"
          >
            <Icon name="east" className="text-[#4A5275] hover:text-slate-300 text-sm" />
          </button>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1.5 rounded hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
          title="Refresh"
        >
          <Icon name="refresh" className={`text-[#4A5275] hover:text-slate-300 text-base ${loading ? 'animate-spin' : ''}`} />
        </button>

        {onToggleTree && (
          <button
            onClick={onToggleTree}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              showTree ? 'hover:bg-white/5' : 'bg-[#7C6DFA]/10 hover:bg-[#7C6DFA]/20'
            }`}
            title={showTree ? 'Hide explorer' : 'Show explorer'}
          >
            <Icon
              name="account_tree"
              className={`text-base ${showTree ? 'text-[#4A5275] hover:text-slate-300' : 'text-[#7C6DFA]'}`}
            />
          </button>
        )}

        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-white/5 transition-colors cursor-pointer"
          title="Close file browser"
        >
          <Icon name="close" className="text-[#4A5275] hover:text-slate-300 text-base" />
        </button>
      </div>
    </div>
  );
}
