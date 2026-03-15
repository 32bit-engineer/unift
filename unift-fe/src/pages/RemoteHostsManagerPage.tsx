import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  remoteConnectionAPI,
  type SessionState,
  type ConnectRequest,
  type SshAuthType,
  type DirectoryListingResponse,
  type TransferStatusResponse,
} from '@/utils/remoteConnectionAPI';

/* ─── Types ────────────────────────────────────────────────────────── */
type ProtocolType = 'SSH_SFTP' | 'FTP' | 'SMB';
type StatusFilter = 'all' | 'online' | 'offline' | 'warning';

type FileEntry = DirectoryListingResponse['entries'][number];

interface UIHost {
  sessionId: string;
  name: string;
  status: 'online' | 'offline' | 'warning';
  userAtIp: string;
  protocol: string;
  port: number;
  lastConnected: string;
  latency: number;
}

/* ─── Components ───────────────────────────────────────────────────── */

interface IconProps {
  name: string;
  className?: string;
  filled?: boolean;
}

function Icon({ name, className = 'text-base', filled = false }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
    >
      {name}
    </span>
  );
}

interface StatusDotProps {
  status: 'online' | 'offline' | 'warning';
}

function StatusDot({ status }: StatusDotProps) {
  const colorMap = {
    online: 'bg-[#4ade80]',
    offline: 'bg-slate-500',
    warning: 'bg-[#E07B39]',
  };
  return <div className={`w-2 h-2 rounded-full ${colorMap[status]}`} />;
}

interface BadgeProps {
  variant: 'active' | 'warning';
  children: React.ReactNode;
}

function Badge({ variant, children }: BadgeProps) {
  const classes = {
    active: 'bg-blue-900/40 text-[#4F8EF7] border border-blue-700/40',
    warning: 'bg-orange-900/40 text-[#E07B39] border border-orange-700/40',
  };
  return <span className={`px-2 py-1 rounded text-xs font-mono uppercase tracking-wider ${classes[variant]}`}>{children}</span>;
}

/* ─── File Browser Panel ───────────────────────────────────────────── */

interface FileBrowserProps {
  host: UIHost;
  onClose: () => void;
}

type ModalState =
  | { type: 'none' }
  | { type: 'delete'; entries: FileEntry[] }
  | { type: 'rename'; entry: FileEntry }
  | { type: 'newFolder' };

function FileBrowser({ host, onClose }: FileBrowserProps) {
  const [pathStack, setPathStack]     = useState<string[]>(['/']);
  const [entries, setEntries]         = useState<FileEntry[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [modal, setModal]             = useState<ModalState>({ type: 'none' });
  const [renameValue, setRenameValue] = useState('');
  const [folderName, setFolderName]   = useState('');
  const [opLoading, setOpLoading]     = useState(false);
  const [transfers, setTransfers]     = useState<TransferStatusResponse[]>([]);
  const [showTransfers, setShowTransfers] = useState(false);
  const uploadInputRef                = useRef<HTMLInputElement>(null);

  const currentPath = pathStack[pathStack.length - 1];

  // ── Directory loading ──────────────────────────────────────────────
  const loadDirectory = useCallback(async (path: string) => {
    try {
      setLoading(true);
      setError(null);
      setSelected(new Set());
      const res = await remoteConnectionAPI.listDirectory(host.sessionId, path);
      const sorted = [...res.entries].sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'DIRECTORY' ? -1 : 1;
      });
      setEntries(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, [host.sessionId]);

  useEffect(() => { loadDirectory(currentPath); }, [currentPath, loadDirectory]);

  // ── Navigation ─────────────────────────────────────────────────────
  const navigateInto = (dirName: string) => {
    const next = currentPath === '/' ? `/${dirName}` : `${currentPath}/${dirName}`;
    setPathStack(prev => [...prev, next]);
  };
  const navigateBack = () => {
    if (pathStack.length > 1) setPathStack(prev => prev.slice(0, -1));
  };
  const navigateToBreadcrumb = (index: number) => {
    setPathStack(prev => prev.slice(0, index + 1));
  };

  // ── Selection helpers ──────────────────────────────────────────────
  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected(prev => prev.size === entries.length ? new Set() : new Set(entries.map(e => e.name)));
  };
  const selectedEntries = entries.filter(e => selected.has(e.name));

  // ── Build absolute path for an entry ──────────────────────────────
  const absPath = (name: string) =>
    currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;

  // ── Operations ─────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (modal.type !== 'delete') return;
    try {
      setOpLoading(true);
      await Promise.all(
        modal.entries.map(e => remoteConnectionAPI.deleteFile(host.sessionId, absPath(e.name)))
      );
      setModal({ type: 'none' });
      await loadDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setModal({ type: 'none' });
    } finally {
      setOpLoading(false);
    }
  };

  const handleRename = async () => {
    if (modal.type !== 'rename' || !renameValue.trim()) return;
    const oldPath = absPath(modal.entry.name);
    const newPath = currentPath === '/' ? `/${renameValue.trim()}` : `${currentPath}/${renameValue.trim()}`;
    try {
      setOpLoading(true);
      await remoteConnectionAPI.renameFile(host.sessionId, oldPath, newPath);
      setModal({ type: 'none' });
      setRenameValue('');
      await loadDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed');
      setModal({ type: 'none' });
    } finally {
      setOpLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    const newPath = currentPath === '/' ? `/${folderName.trim()}` : `${currentPath}/${folderName.trim()}`;
    try {
      setOpLoading(true);
      await remoteConnectionAPI.createDirectory(host.sessionId, newPath);
      setModal({ type: 'none' });
      setFolderName('');
      await loadDirectory(currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create folder failed');
      setModal({ type: 'none' });
    } finally {
      setOpLoading(false);
    }
  };

  const handleDownload = async (entry: FileEntry) => {
    try {
      await remoteConnectionAPI.downloadFile(host.sessionId, absPath(entry.name), entry.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      setOpLoading(true);
      for (const file of Array.from(files)) {
        const remotePath = absPath(file.name);
        await remoteConnectionAPI.uploadFile(host.sessionId, remotePath, file);
      }
      await loadDirectory(currentPath);
      // Refresh transfer list so the transfers panel shows the new entries
      const updated = await remoteConnectionAPI.getTransfers(host.sessionId);
      setTransfers(updated);
      setShowTransfers(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setOpLoading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const refreshTransfers = async () => {
    try {
      const list = await remoteConnectionAPI.getTransfers(host.sessionId);
      setTransfers(list);
    } catch { /* non-critical */ }
  };

  // ── Formatting helpers ─────────────────────────────────────────────
  const formatSize = (bytes?: number) => {
    if (bytes === undefined) return '—';
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };
  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const breadcrumbSegments = pathStack.map((p, i) => ({
    label: i === 0 ? host.userAtIp : p.split('/').filter(Boolean).pop() ?? p,
    index: i,
  }));

  const hasSelection = selected.size > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#161923] relative">

      {/* ── Browser Header ── */}
      <div className="h-14 bg-[#1E2130] border-b border-[#2E3348] px-4 flex items-center gap-3 shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/5 rounded transition-colors cursor-pointer"
          title="Back to sessions"
        >
          <Icon name="arrow_back" className="text-slate-400 text-lg" />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
          {breadcrumbSegments.map((seg, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Icon name="chevron_right" className="text-slate-600 text-sm shrink-0" />}
              <button
                onClick={() => navigateToBreadcrumb(seg.index)}
                className={`text-xs font-mono whitespace-nowrap px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0 ${
                  i === breadcrumbSegments.length - 1 ? 'text-[#E2E8F0]' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {seg.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        <button
          onClick={() => loadDirectory(currentPath)}
          disabled={loading}
          className="p-1.5 hover:bg-white/5 rounded transition-colors cursor-pointer disabled:opacity-40"
          title="Refresh"
        >
          <Icon name="refresh" className={`text-slate-400 text-base ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="bg-[#1E2130] border-b border-[#2E3348] px-4 py-2 flex items-center gap-2 shrink-0 flex-wrap">
        {/* Upload */}
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => handleUpload(e.target.files)}
        />
        <button
          onClick={() => uploadInputRef.current?.click()}
          disabled={opLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4F8EF7] rounded text-[10px] font-mono uppercase tracking-widest text-white hover:brightness-110 transition-all disabled:opacity-40 cursor-pointer"
        >
          <Icon name="upload" className="text-sm" />
          Upload
        </button>

        {/* New folder */}
        <button
          onClick={() => { setFolderName(''); setModal({ type: 'newFolder' }); }}
          disabled={opLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-40 cursor-pointer"
        >
          <Icon name="create_new_folder" className="text-sm" />
          New Folder
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-[#2E3348]" />

        {/* Download — single file only */}
        {hasSelection && selectedEntries.length === 1 && selectedEntries[0].type === 'FILE' && (
          <button
            onClick={() => handleDownload(selectedEntries[0])}
            disabled={opLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Icon name="download" className="text-sm" />
            Download
          </button>
        )}

        {/* Rename — single item only */}
        {hasSelection && selectedEntries.length === 1 && (
          <button
            onClick={() => { setRenameValue(selectedEntries[0].name); setModal({ type: 'rename', entry: selectedEntries[0] }); }}
            disabled={opLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Icon name="drive_file_rename_outline" className="text-sm" />
            Rename
          </button>
        )}

        {/* Delete */}
        {hasSelection && (
          <button
            onClick={() => setModal({ type: 'delete', entries: selectedEntries })}
            disabled={opLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-800/60 rounded text-[10px] font-mono uppercase tracking-widest text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Icon name="delete" className="text-sm" />
            Delete ({selected.size})
          </button>
        )}

        <div className="flex-1" />

        {/* Transfers toggle */}
        <button
          onClick={() => { setShowTransfers(v => !v); if (!showTransfers) refreshTransfers(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-400 hover:bg-white/5 transition-colors cursor-pointer"
        >
          <Icon name="swap_vert" className="text-sm" />
          Transfers
          {transfers.length > 0 && (
            <span className="ml-1 bg-[#4F8EF7] text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center">
              {transfers.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mx-4 mt-3 bg-red-900/30 border border-red-700/50 rounded p-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="error" className="text-red-400 text-base" />
            <span className="text-xs text-red-200">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="cursor-pointer">
            <Icon name="close" className="text-red-400 text-sm" />
          </button>
        </div>
      )}

      {/* ── Transfers panel ── */}
      {showTransfers && (
        <div className="mx-4 mt-3 bg-[#1E2130] border border-[#2E3348] rounded shrink-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#2E3348]">
            <span className="label">Transfer History</span>
            <div className="flex items-center gap-2">
              <button onClick={refreshTransfers} className="cursor-pointer">
                <Icon name="refresh" className="text-slate-500 text-sm hover:text-slate-300" />
              </button>
              <button onClick={() => setShowTransfers(false)} className="cursor-pointer">
                <Icon name="close" className="text-slate-500 text-sm hover:text-slate-300" />
              </button>
            </div>
          </div>
          {transfers.length === 0 ? (
            <div className="px-4 py-4 text-xs font-mono text-slate-600 text-center">No transfers yet</div>
          ) : (
            <div className="max-h-40 overflow-y-auto custom-scrollbar">
              {transfers.map(t => (
                <div key={t.transferId} className="flex items-center gap-3 px-4 py-2 border-b border-[#2E3348]/50">
                  <Icon
                    name={t.direction === 'UPLOAD' ? 'upload' : 'download'}
                    className={`text-sm ${t.direction === 'UPLOAD' ? 'text-[#4F8EF7]' : 'text-[#4ade80]'}`}
                  />
                  <span className="text-xs font-mono text-slate-300 flex-1 truncate">
                    {t.remotePath.split('/').pop()}
                  </span>
                  <div className="w-24">
                    <div className="prog-track">
                      <div
                        className={t.state === 'COMPLETED' ? 'prog-done' : 'prog-fill'}
                        style={{ width: `${t.progressPercent}%` }}
                      />
                    </div>
                  </div>
                  <span className={`label w-16 text-right ${
                    t.state === 'COMPLETED' ? 'text-[#4ade80]' :
                    t.state === 'FAILED' ? 'text-red-400' :
                    t.state === 'IN_PROGRESS' ? 'text-[#4F8EF7]' : ''
                  }`}>
                    {t.state === 'IN_PROGRESS' ? `${t.progressPercent}%` : t.state}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Column Headers ── */}
      <div className="grid grid-cols-[24px_auto_1fr_auto_auto_auto] items-center gap-x-4 gap-y-0 px-4 py-2 border-b border-[#2E3348] shrink-0">
        <input
          type="checkbox"
          checked={entries.length > 0 && selected.size === entries.length}
          onChange={toggleSelectAll}
          className="w-3.5 h-3.5 rounded accent-[#4F8EF7] cursor-pointer"
        />
        <div className="w-5" />
        <span className="label">Name</span>
        <span className="label w-20 text-right">Size</span>
        <span className="label w-28 text-right">Modified</span>
        <span className="label w-20 text-right">Perms</span>
      </div>

      {/* ── Back row (when not at root) ── */}
      {pathStack.length > 1 && (
        <button
          onClick={navigateBack}
          className="grid grid-cols-[24px_auto_1fr_auto_auto_auto] items-center gap-x-4 gap-y-0 px-4 py-2 hover:bg-white/5 transition-colors cursor-pointer border-b border-[#2E3348] text-left shrink-0"
        >
          <div className="w-3.5" />
          <Icon name="arrow_upward" className="text-slate-500 text-base" />
          <span className="text-xs font-mono text-slate-500">..</span>
          <span className="w-20" /><span className="w-28" /><span className="w-20" />
        </button>
      )}

      {/* ── Directory Entries ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading && (
          <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
            <Icon name="hourglass_bottom" className="text-lg animate-spin" />
            <span className="text-xs font-mono">Loading...</span>
          </div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-600">
            <Icon name="folder_open" className="text-3xl" />
            <span className="text-xs font-mono">Empty directory</span>
          </div>
        )}
        {!loading && entries.map((entry, i) => {
          const isDir = entry.type === 'DIRECTORY';
          const isSymlink = entry.type === 'SYMLINK';
          const isSelected = selected.has(entry.name);
          const iconName = isDir ? 'folder' : isSymlink ? 'link' : getFileIcon(entry.name);
          const iconColor = isDir ? 'text-[#E07B39]' : isSymlink ? 'text-[#4F8EF7]' : 'text-slate-400';

          return (
            <div
              key={i}
              className={`group grid grid-cols-[24px_auto_1fr_auto_auto_auto] items-center gap-x-4 gap-y-0 px-4 py-2 border-b border-[#2E3348]/50 transition-colors ${
                isSelected ? 'bg-[#4F8EF7]/10' : 'hover:bg-white/5'
              }`}
            >
              {/* Checkbox */}
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(entry.name)}
                onClick={e => e.stopPropagation()}
                className="w-3.5 h-3.5 rounded accent-[#4F8EF7] cursor-pointer"
              />

              {/* Icon */}
              <div
                onClick={() => isDir && navigateInto(entry.name)}
                className={isDir ? 'cursor-pointer' : 'cursor-default'}
              >
                <Icon name={iconName} className={`${iconColor} text-base`} filled={isDir} />
              </div>

              {/* Name */}
              <span
                onClick={() => isDir && navigateInto(entry.name)}
                className={`text-xs font-mono truncate ${isDir ? 'text-[#E2E8F0] cursor-pointer hover:text-[#4F8EF7]' : 'text-slate-300 cursor-default'}`}
              >
                {entry.name}
                {isDir && <span className="text-slate-600">/</span>}
              </span>

              {/* Size */}
              <span className="text-xs font-mono text-slate-500 w-20 text-right">
                {formatSize(entry.sizeBytes)}
              </span>

              {/* Modified */}
              <span className="text-xs font-mono text-slate-500 w-28 text-right">
                {formatDate(entry.lastModified)}
              </span>

              {/* Perms + row actions (shown on hover or selection) */}
              <div className="w-20 flex items-center justify-end gap-1">
                {!isSelected && (
                  <span className="text-[10px] font-mono text-slate-600 group-hover:hidden">
                    {entry.permissions ?? '—'}
                  </span>
                )}
                <div className={`items-center gap-0.5 ${isSelected ? 'flex' : 'hidden group-hover:flex'}`}>
                  {entry.type === 'FILE' && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDownload(entry); }}
                      className="p-1 hover:bg-white/10 rounded cursor-pointer"
                      title="Download"
                    >
                      <Icon name="download" className="text-slate-400 hover:text-[#4ade80] text-sm" />
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); setRenameValue(entry.name); setModal({ type: 'rename', entry }); }}
                    className="p-1 hover:bg-white/10 rounded cursor-pointer"
                    title="Rename"
                  >
                    <Icon name="drive_file_rename_outline" className="text-slate-400 hover:text-[#4F8EF7] text-sm" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setModal({ type: 'delete', entries: [entry] }); }}
                    className="p-1 hover:bg-white/10 rounded cursor-pointer"
                    title="Delete"
                  >
                    <Icon name="delete" className="text-slate-400 hover:text-red-400 text-sm" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-[#2E3348] px-4 py-2 flex items-center justify-between shrink-0">
        <span className="label">{currentPath}</span>
        <span className="label">
          {hasSelection ? `${selected.size} selected · ` : ''}{entries.length} items
        </span>
      </div>

      {/* ── Delete Confirm Modal ── */}
      {modal.type === 'delete' && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1E2130] border border-[#2E3348] rounded w-96 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="warning" className="text-red-400 text-2xl" />
              <h3 className="text-sm font-bold text-[#E2E8F0] uppercase tracking-wider">Confirm Delete</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Permanently delete{' '}
              {modal.entries.length === 1
                ? <span className="text-[#E2E8F0] font-mono">"{modal.entries[0].name}"</span>
                : <span className="text-[#E2E8F0] font-mono">{modal.entries.length} items</span>
              }? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setModal({ type: 'none' })}
                disabled={opLoading}
                className="px-4 py-2 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={opLoading}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 rounded text-[10px] font-mono uppercase tracking-widest text-white hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-40"
              >
                {opLoading && <Icon name="hourglass_bottom" className="text-sm animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename Modal ── */}
      {modal.type === 'rename' && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1E2130] border border-[#2E3348] rounded w-96 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="drive_file_rename_outline" className="text-[#4F8EF7] text-2xl" />
              <h3 className="text-sm font-bold text-[#E2E8F0] uppercase tracking-wider">Rename</h3>
            </div>
            <label className="label block mb-1">New Name</label>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setModal({ type: 'none' }); }}
              className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setModal({ type: 'none' })}
                disabled={opLoading}
                className="px-4 py-2 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={opLoading || !renameValue.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#4F8EF7] rounded text-[10px] font-mono uppercase tracking-widest text-white hover:brightness-110 transition-all cursor-pointer disabled:opacity-40"
              >
                {opLoading && <Icon name="hourglass_bottom" className="text-sm animate-spin" />}
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Folder Modal ── */}
      {modal.type === 'newFolder' && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1E2130] border border-[#2E3348] rounded w-96 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="create_new_folder" className="text-[#E07B39] text-2xl" />
              <h3 className="text-sm font-bold text-[#E2E8F0] uppercase tracking-wider">New Folder</h3>
            </div>
            <label className="label block mb-1">Folder Name</label>
            <input
              autoFocus
              value={folderName}
              onChange={e => setFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setModal({ type: 'none' }); }}
              placeholder="my-folder"
              className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setModal({ type: 'none' })}
                disabled={opLoading}
                className="px-4 py-2 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={opLoading || !folderName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#E07B39] rounded text-[10px] font-mono uppercase tracking-widest text-white hover:brightness-110 transition-all cursor-pointer disabled:opacity-40"
              >
                {opLoading && <Icon name="hourglass_bottom" className="text-sm animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'picture_as_pdf',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', svg: 'image', webp: 'image',
    mp4: 'movie', mkv: 'movie', avi: 'movie', mov: 'movie',
    mp3: 'audio_file', wav: 'audio_file', flac: 'audio_file',
    zip: 'folder_zip', tar: 'folder_zip', gz: 'folder_zip', rar: 'folder_zip',
    js: 'code', ts: 'code', py: 'code', java: 'code', go: 'code', rs: 'code',
    html: 'html', css: 'css',
    md: 'article', txt: 'article',
    sh: 'terminal', bash: 'terminal',
    json: 'data_object', xml: 'data_object', yaml: 'data_object', yml: 'data_object',
    sql: 'database',
  };
  return map[ext] ?? 'insert_drive_file';
}

/* ─── Main Component ───────────────────────────────────────────────── */

export function RemoteHostsManagerPage() {
  const [selectedProtocol, setSelectedProtocol] = useState<ProtocolType>('SSH_SFTP');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [authType, setAuthType] = useState<SshAuthType>('PASSWORD');

  // File browser: which session (if any) is open
  const [browserHost, setBrowserHost] = useState<UIHost | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: '22',
    username: '',
    password: '',
    privateKey: '',
    passphrase: '',
    remotePath: '',
    sessionTtlMinutes: '',
    saveConnection: false,
    autoReconnect: false,
  });

  const [sessions, setSessions] = useState<UIHost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load active sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const activeSessions = await remoteConnectionAPI.listSessions();
      const uiHosts = activeSessions.map((session: SessionState) => ({
        sessionId: session.sessionId,
        name: `${session.host}:${session.port}`,
        status: session.state === 'ACTIVE' ? ('online' as const) : ('offline' as const),
        userAtIp: `${session.username}@${session.host}`,
        protocol: session.protocol,
        port: session.port,
        lastConnected: new Date(session.createdAt).toLocaleTimeString(),
        latency: 0,
      }));
      setSessions(uiHosts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  // Filter hosts based on status
  const filteredHosts = useMemo(() => {
    if (statusFilter === 'all') return sessions;
    return sessions.filter(host => host.status === statusFilter);
  }, [statusFilter, sessions]);

  // Count hosts by status
  const statusCounts = {
    all: sessions.length,
    online: sessions.filter(h => h.status === 'online').length,
    offline: sessions.filter(h => h.status === 'offline').length,
    warning: sessions.filter(h => h.status === 'warning').length,
  };

  const handleFormChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleConnect = async () => {
    if (!formData.host || !formData.username) {
      setError('Host and username are required');
      return;
    }

    if (authType === 'PASSWORD' && !formData.password) {
      setError('Password is required');
      return;
    }

    if (authType !== 'PASSWORD' && !formData.privateKey) {
      setError('SSH Key is required');
      return;
    }

    try {
      setLoading(true);
      
      const connectRequest: ConnectRequest = {
        protocol: selectedProtocol,
        host: formData.host,
        port: parseInt(formData.port),
        username: formData.username,
        sshAuthType: authType,
        sessionTtlMinutes: formData.sessionTtlMinutes ? parseInt(formData.sessionTtlMinutes) : 30,
        ...(authType === 'PASSWORD' && { password: formData.password }),
        ...(authType === 'PRIVATE_KEY' && { privateKey: formData.privateKey }),
        ...(authType === 'PRIVATE_KEY_PASSPHRASE' && { 
          privateKey: formData.privateKey,
          passphrase: formData.passphrase 
        }),
      };

      await remoteConnectionAPI.connect(connectRequest);
      
      // Reload sessions
      await loadSessions();
      
      // Clear form
      setFormData({
        name: '',
        host: '',
        port: '22',
        username: '',
        password: '',
        privateKey: '',
        passphrase: '',
        remotePath: '',
        sessionTtlMinutes: '',
        saveConnection: false,
        autoReconnect: false,
      });
      
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (sessionId: string) => {
    try {
      setLoading(true);
      await remoteConnectionAPI.closeSession(sessionId);
      setSessions(prev => prev.filter(h => h.sessionId !== sessionId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeInfo = (status: 'online' | 'offline' | 'warning') => {
    const map = {
      online: { label: 'ONLINE', variant: 'active' as const, icon: 'check_circle' },
      offline: { label: 'OFFLINE', variant: 'warning' as const, icon: 'cancel' },
      warning: { label: 'HIGH LATENCY', variant: 'warning' as const, icon: 'warning' },
    };
    return map[status];
  };

  return (
    <div className="h-screen flex flex-col bg-[#161923]">
      {/* ─── Header ───────────────────────────────────────────────────────── */}
      <header className="border-b-2 border-[#2E3348] bg-[#1E2130] px-6 h-16 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="text-sm font-mono text-slate-400">
            <span className="text-[#E2E8F0]">Home</span>
            <span className="mx-2 text-slate-600">/</span>
            <span className="text-[#E2E8F0]">Remote Host</span>
            <span className="mx-2 text-slate-600">/</span>
            <span className="text-slate-500">Connections</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search hosts..."
              className="bg-[#11141C] min-w-80 border border-[#2E3348] rounded px-3 py-2 text-xs text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none"
            />
            <Icon name="search" className="text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 text-sm" />
          </div>
          <button className="p-2 hover:bg-white/5 rounded transition-colors relative cursor-pointer">
            <Icon name="notifications" className="text-slate-400" />
            <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-[#E07B39] rounded-full" />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-[#4F8EF7] rounded text-[10px] font-bold uppercase tracking-widest text-white font-mono shadow-lg shadow-[#4F8EF7]/15 hover:brightness-110 transition-all cursor-pointer">
            <Icon name="add" className="text-base" />
            New Connection
          </button>
        </div>
      </header>

      {/* ─── Main Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex gap-6 p-6">
        {/* ─── Left Panel: New Connection Form ────────────────────────────────── */}
        <div className="w-80 flex flex-col gap-4 overflow-y-auto">
          {/* Error Alert */}
          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="error" className="text-red-400 text-base" />
                <span className="text-xs text-red-200">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="cursor-pointer">
                <Icon name="close" className="text-red-400 text-sm" />
              </button>
            </div>
          )}

          <div className="bg-[#1E2130] border border-[#2E3348] rounded p-4 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#E2E8F0]">New Connection</h3>

            {/* Protocol Tabs */}
            <div className="flex gap-2 border-b border-[#2E3348]">
              {(['SSH_SFTP', 'FTP', 'SMB'] as const).map(proto => (
                <button
                  key={proto}
                  onClick={() => setSelectedProtocol(proto)}
                  className={`px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors border-b-2 -mb-px cursor-pointer ${
                    selectedProtocol === proto
                      ? 'text-[#4F8EF7] border-[#4F8EF7]'
                      : 'text-slate-500 border-transparent hover:text-slate-300'
                  }`}
                >
                  {proto === 'SSH_SFTP' ? 'SFTP' : proto}
                </button>
              ))}
            </div>

            {/* Form Fields */}
            <div className="space-y-2">
              {/* Connection Name */}
              <div>
                <label className="label block mb-1.5">Connection Name</label>
                <input
                  type="text"
                  placeholder="e.g., Production Server"
                  value={formData.name}
                  onChange={e => handleFormChange('name', e.target.value)}
                  className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all"
                />
              </div>

              {/* Host/IP */}
              <div>
                <label className="label block mb-1.5">Host / IP Address</label>
                <input
                  type="text"
                  placeholder="e.g., 192.168.1.100"
                  value={formData.host}
                  onChange={e => handleFormChange('host', e.target.value)}
                  className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all"
                />
              </div>

              {/* Port & Username */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label block mb-1.5">Port</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={e => handleFormChange('port', e.target.value)}
                    className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="label block mb-1.5">Username</label>
                  <input
                    type="text"
                    placeholder="e.g., ubuntu"
                    value={formData.username}
                    onChange={e => handleFormChange('username', e.target.value)}
                    className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Auth Type Toggle */}
              <div className="flex gap-3 bg-[#11141C] rounded p-2">
                {(['PASSWORD', 'PRIVATE_KEY'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setAuthType(type)}
                    className={`flex-1 px-2 py-1.5 text-xs font-mono uppercase tracking-wider rounded transition-all cursor-pointer ${
                      authType === type
                        ? 'bg-[#4F8EF7] text-white'
                        : 'text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    {type === 'PASSWORD' ? 'Password' : 'SSH Key'}
                  </button>
                ))}
              </div>

              {/* Password / SSH Key */}
              {authType === 'PASSWORD' ? (
                <div>
                  <label className="label block mb-1.5">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={e => handleFormChange('password', e.target.value)}
                    className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all"
                  />
                </div>
              ) : (
                <div>
                  <label className="label block mb-1.5">SSH Key (PEM)</label>
                  <textarea
                    placeholder="-----BEGIN PRIVATE KEY-----"
                    value={formData.privateKey}
                    onChange={e => handleFormChange('privateKey', e.target.value)}
                    className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all h-20 resize-none"
                  />
                </div>
              )}

              {/* Remote Path */}
              <div>
                <label className="label block mb-1.5">Remote Path (Optional)</label>
                <input
                  type="text"
                  placeholder="/home/user/data"
                  value={formData.remotePath}
                  onChange={e => handleFormChange('remotePath', e.target.value)}
                  className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all"
                />
              </div>

              {/* Session TTL */}
              <div>
                <label className="label block mb-1.5">
                  Session TTL
                  <span className="ml-2 text-slate-600 normal-case font-sans">(minutes, default 30)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  placeholder="30"
                  value={formData.sessionTtlMinutes}
                  onChange={e => handleFormChange('sessionTtlMinutes', e.target.value)}
                  className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-[#E2E8F0] placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all"
                />
              </div>

              {/* Checkboxes */}
              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-3 w-fit cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.saveConnection}
                    onChange={e => handleFormChange('saveConnection', e.target.checked)}
                    className="w-4 h-4 rounded bg-[#11141C] border border-[#2E3348] accent-[#4F8EF7] cursor-pointer"
                  />
                  <span className="text-xs text-slate-300">Save this connection</span>
                </label>
                <label className="flex items-center gap-3 w-fit cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.autoReconnect}
                    onChange={e => handleFormChange('autoReconnect', e.target.checked)}
                    className="w-4 h-4 rounded bg-[#11141C] border border-[#2E3348] accent-[#4F8EF7] cursor-pointer"
                  />
                  <span className="text-xs text-slate-300">Auto-reconnect</span>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleConnect}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#4F8EF7] rounded text-[10px] font-bold uppercase tracking-widest text-white font-mono hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
              >
                <Icon name={loading ? 'hourglass_bottom' : 'play_arrow'} className="text-sm" />
                {loading ? 'Connecting...' : 'Connect'}
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-[#2E3348] rounded text-[10px] font-bold uppercase tracking-widest text-slate-300 font-mono hover:bg-white/5 transition-colors cursor-pointer">
                <Icon name="check_circle" className="text-sm" />
                Test
              </button>
            </div>
          </div>

          {/* Saved Hosts Section */}
          <div className="bg-[#1E2130] border border-[#2E3348] rounded p-4">
            <h3 className="label block mb-3">Recent Connections</h3>
            <div className="space-y-2">
              {sessions.slice(0, 3).map(host => (
                <div key={host.sessionId} className="flex items-center gap-2 p-2 rounded hover:bg-white/5 transition-colors cursor-pointer">
                  <StatusDot status={host.status} />
                  <span className="text-xs text-slate-300 flex-1 truncate">{host.name}</span>
                  <Icon name="more_vert" className="text-slate-600 hover:text-slate-400 text-sm" />
                </div>
              ))}
              {sessions.length === 0 && (
                <div className="text-xs text-slate-500 text-center py-4">No connections yet</div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Right Panel: File Browser OR Session List ─────────────────────── */}
        {browserHost ? (
          <FileBrowser host={browserHost} onClose={() => setBrowserHost(null)} />
        ) : (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* Status Tabs */}
            <div className="flex gap-1 items-center bg-[#1E2130] rounded p-1 w-fit">
              {(['all', 'online', 'offline', 'warning'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded text-xs font-mono uppercase tracking-wider transition-all cursor-pointer ${
                    statusFilter === status
                      ? 'bg-[#4F8EF7] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {status === 'all' ? 'All' : status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Warning'}
                  {' '}
                  <span className="font-bold">({statusCounts[status]})</span>
                </button>
              ))}
            </div>

            {/* View Toggle & Sort */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {(['list', 'grid'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`p-2 rounded transition-colors cursor-pointer ${
                      viewMode === mode ? 'bg-[#4F8EF7] text-white' : 'bg-[#1E2130] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon name={mode === 'list' ? 'list' : 'grid_on'} className="text-base" />
                  </button>
                ))}
              </div>
              <button className="flex items-center gap-2 px-3 py-2 text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors cursor-pointer">
                <Icon name="sort" className="text-sm" />
                Sort
              </button>
            </div>

            {/* Host List / Grid */}
            <div className={`flex-1 overflow-y-auto custom-scrollbar ${viewMode === 'grid' ? 'grid grid-cols-2 xl:grid-cols-3 gap-3 content-start' : 'space-y-1.5'}`}>
              {loading && (
                <div className={`text-center text-slate-400 py-8 ${viewMode === 'grid' ? 'col-span-full' : ''}`}>
                  Loading sessions...
                </div>
              )}
              {!loading && filteredHosts.length === 0 && (
                <div className={`text-center text-slate-400 py-8 ${viewMode === 'grid' ? 'col-span-full' : ''}`}>
                  No connections found
                </div>
              )}

              {/* ── List view ── */}
              {viewMode === 'list' && filteredHosts.map(host => {
                const statusInfo = getStatusBadgeInfo(host.status);
                return (
                  <div
                    key={host.sessionId}
                    onClick={() => host.status === 'online' && setBrowserHost(host)}
                    className={`bg-[#1E2130] border border-[#2E3348] rounded p-3 transition-colors ${
                      host.status === 'online'
                        ? 'hover:bg-[#242a3a] hover:border-[#4F8EF7]/40 cursor-pointer'
                        : 'opacity-60 cursor-default'
                    }`}
                  >
                    {/* Host Row */}
                    <div className="flex items-center gap-4 mb-1.5">
                      <Icon
                        name={host.protocol === 'SSH_SFTP' ? 'folder_open' : host.protocol === 'FTP' ? 'cloud_upload' : 'storage'}
                        className={`text-xl ${host.status === 'online' ? 'text-[#4F8EF7]' : 'text-slate-500'}`}
                        filled={host.status === 'online'}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="text-sm font-bold text-[#E2E8F0] truncate">{host.name}</h4>
                          <Badge variant={statusInfo.variant}>
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <div className="text-xs font-mono text-slate-500">{host.userAtIp}</div>
                      </div>
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        {host.status === 'online' && (
                          <button
                            onClick={() => setBrowserHost(host)}
                            className="p-2 hover:bg-white/5 rounded transition-colors cursor-pointer"
                            title="Browse files"
                          >
                            <Icon name="folder_open" className="text-[#4F8EF7] text-base" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDisconnect(host.sessionId)}
                          className="p-2 hover:bg-white/5 rounded transition-colors cursor-pointer"
                          title="Disconnect"
                        >
                          <Icon name="close" className="text-slate-400 hover:text-red-400 text-base" />
                        </button>
                      </div>
                    </div>

                    {/* Host Details */}
                    <div className="grid grid-cols-4 gap-4 text-xs pl-10 pr-4">
                      <div>
                        <span className="label block mb-1">Protocol</span>
                        <span className="text-slate-300">{host.protocol}:{host.port}</span>
                      </div>
                      <div>
                        <span className="label block mb-1">Last Connected</span>
                        <span className="text-slate-300">{host.lastConnected}</span>
                      </div>
                      <div>
                        <span className="label block mb-1">Latency</span>
                        <span className={host.latency > 100 ? 'text-[#E07B39]' : 'text-[#4ade80]'}>
                          {host.latency}ms
                        </span>
                      </div>
                      <div>
                        <span className="label block mb-1">Status</span>
                        <span className={`font-mono ${host.status === 'online' ? 'text-[#4ade80]' : host.status === 'warning' ? 'text-[#E07B39]' : 'text-slate-500'}`}>
                          {host.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* ── Grid view ── */}
              {viewMode === 'grid' && filteredHosts.map(host => {
                const statusInfo = getStatusBadgeInfo(host.status);
                const isOnline = host.status === 'online';
                const protocolIcon = host.protocol === 'SSH_SFTP' ? 'terminal' : host.protocol === 'FTP' ? 'cloud_upload' : 'storage';
                return (
                  <div
                    key={host.sessionId}
                    onClick={() => isOnline && setBrowserHost(host)}
                    className={`bg-[#1E2130] border rounded flex flex-col transition-all ${
                      isOnline
                        ? 'border-[#2E3348] hover:border-[#4F8EF7]/50 hover:bg-[#232a3a] cursor-pointer'
                        : 'border-[#2E3348] opacity-60 cursor-default'
                    }`}
                  >
                    {/* Card Header — colored band */}
                    <div className={`h-1.5 rounded-t ${isOnline ? 'bg-[#4F8EF7]' : host.status === 'warning' ? 'bg-[#E07B39]' : 'bg-slate-600'}`} />

                    {/* Card Body */}
                    <div className="p-4 flex flex-col gap-3 flex-1">
                      {/* Icon + name + badge */}
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${
                          isOnline ? 'bg-[#4F8EF7]/15' : 'bg-white/5'
                        }`}>
                          <Icon
                            name={protocolIcon}
                            className={`text-xl ${isOnline ? 'text-[#4F8EF7]' : 'text-slate-500'}`}
                            filled={isOnline}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-[#E2E8F0] truncate mb-1">{host.name}</h4>
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </div>
                      </div>

                      {/* user@host */}
                      <div className="flex items-center gap-1.5">
                        <Icon name="person" className="text-slate-600 text-sm" />
                        <span className="text-[11px] font-mono text-slate-500 truncate">{host.userAtIp}</span>
                      </div>

                      {/* Meta grid */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[#2E3348] pt-3 mt-auto">
                        <div>
                          <span className="label block mb-0.5">Protocol</span>
                          <span className="text-[11px] font-mono text-slate-300">{host.protocol}</span>
                        </div>
                        <div>
                          <span className="label block mb-0.5">Port</span>
                          <span className="text-[11px] font-mono text-slate-300">{host.port}</span>
                        </div>
                        <div>
                          <span className="label block mb-0.5">Latency</span>
                          <span className={`text-[11px] font-mono ${host.latency > 100 ? 'text-[#E07B39]' : 'text-[#4ade80]'}`}>
                            {host.latency > 0 ? `${host.latency}ms` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="label block mb-0.5">Since</span>
                          <span className="text-[11px] font-mono text-slate-400">{host.lastConnected}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer — actions */}
                    <div
                      className="px-4 py-2.5 border-t border-[#2E3348] flex items-center justify-end gap-1"
                      onClick={e => e.stopPropagation()}
                    >
                      {isOnline && (
                        <button
                          onClick={() => setBrowserHost(host)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-[#4F8EF7] hover:bg-[#4F8EF7]/10 rounded transition-colors cursor-pointer"
                          title="Browse files"
                        >
                          <Icon name="folder_open" className="text-sm" />
                          Browse
                        </button>
                      )}
                      <button
                        onClick={() => handleDisconnect(host.sessionId)}
                        className="p-1.5 hover:bg-white/5 rounded transition-colors cursor-pointer"
                        title="Disconnect"
                      >
                        <Icon name="close" className="text-slate-500 hover:text-red-400 text-base" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stats Footer */}
            <div className="bg-[#1E2130] border border-[#2E3348] rounded p-4 grid grid-cols-3 gap-6">
              <div>
                <span className="label block mb-1">Total Sessions</span>
                <span className="text-lg font-bold text-[#E2E8F0]">{sessions.length}</span>
              </div>
              <div>
                <span className="label block mb-1">Active</span>
                <span className="text-lg font-bold text-[#4ade80]">{statusCounts.online}</span>
              </div>
              <div>
                <span className="label block mb-1">Inactive</span>
                <span className="text-lg font-bold text-[#E07B39]">{statusCounts.offline + statusCounts.warning}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
