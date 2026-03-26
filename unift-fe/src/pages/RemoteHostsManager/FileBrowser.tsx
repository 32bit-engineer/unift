import { useState, useEffect, useCallback, useRef } from 'react';
import { remoteConnectionAPI, type TransferStatusResponse } from '@/utils/remoteConnectionAPI';
import { getErrorMessage } from '@/utils/apiClient';
import { RemoteEditor } from '@/components/ui';
import { Icon, getFileIcon, formatSize, formatDate } from './shared';
import { FileBrowserHeader } from './FileBrowserHeader';
import { FileBrowserToolbar } from './FileBrowserToolbar';
import { FileBrowserModals } from './FileBrowserModals';
import type { UIHost, FileEntry, ModalState, EditorState } from './types';

interface FileBrowserProps {
  host: UIHost;
  onClose: () => void;
  onSessionExpired?: () => void;
}

export function FileBrowser({ host, onClose, onSessionExpired }: FileBrowserProps) {
  const [pathStack, setPathStack]         = useState<string[]>(['/']);
  const [entries, setEntries]             = useState<FileEntry[]>([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [selected, setSelected]           = useState<Set<string>>(new Set());
  const [modal, setModal]                 = useState<ModalState>({ type: 'none' });
  const [renameValue, setRenameValue]     = useState('');
  const [folderName, setFolderName]       = useState('');
  const [newFileName, setNewFileName]     = useState('');
  const [opLoading, setOpLoading]         = useState(false);
  const [transfers, setTransfers]         = useState<TransferStatusResponse[]>([]);
  const [showTransfers, setShowTransfers] = useState(false);
  const uploadAbortControllers            = useRef<Map<string, AbortController>>(new Map());
  const [successMsg, setSuccessMsg]       = useState<string | null>(null);
  const [editorState, setEditorState]     = useState<EditorState | null>(null);
  const [pathInputValue, setPathInputValue] = useState('/');

  // When navigateInto() pre-loads a directory, this flag tells the path-change
  // useEffect to skip the redundant second fetch for that path.
  const skipNextLoadRef = useRef(false);

  // Sets the error state and, if the server reports the session is gone,
  // notifies the parent so it can clean up the stale connection.
  const handleApiError = useCallback((err: unknown, fallback: string) => {
    const msg = getErrorMessage(err, fallback);
    setError(msg);
    if (msg.toLowerCase().includes('session not found')) {
      onSessionExpired?.();
    }
  }, [onSessionExpired]);

  const currentPath = pathStack[pathStack.length - 1];

  // Keep path input in sync with active directory
  useEffect(() => {
    setPathInputValue(currentPath);
  }, [currentPath]);

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
      handleApiError(err, 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, [host.sessionId, handleApiError]);

  useEffect(() => {
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }
    loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  // ── Navigation ─────────────────────────────────────────────────────
  const navigateInto = async (dirName: string) => {
    const next = currentPath === '/' ? `/${dirName}` : `${currentPath}/${dirName}`;
    try {
      setLoading(true);
      setError(null);
      setSelected(new Set());
      const res = await remoteConnectionAPI.listDirectory(host.sessionId, next);
      const sorted = [...res.entries].sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'DIRECTORY' ? -1 : 1;
      });
      skipNextLoadRef.current = true;
      setPathStack(prev => [...prev, next]);
      setEntries(sorted);
    } catch (err) {
      handleApiError(err, 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  };

  const navigateBack = () => {
    if (pathStack.length > 1) setPathStack(prev => prev.slice(0, -1));
  };

  const navigateToBreadcrumb = (index: number) => {
    setPathStack(prev => prev.slice(0, index + 1));
  };

  /*
   * Navigate directly to an absolute path typed by the user.
   * Builds a proper breadcrumb stack so navigation history is correct.
   */
  const navigateToAbsPath = async (newPath: string) => {
    const normalized = newPath.trim().startsWith('/') ? newPath.trim() : `/${newPath.trim()}`;
    if (normalized === currentPath) return;
    try {
      setLoading(true);
      setError(null);
      setSelected(new Set());
      const res = await remoteConnectionAPI.listDirectory(host.sessionId, normalized);
      const sorted = [...res.entries].sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'DIRECTORY' ? -1 : 1;
      });
      const parts = normalized.split('/').filter(Boolean);
      const stack: string[] = ['/', ...parts.map((_, i) => '/' + parts.slice(0, i + 1).join('/'))];
      skipNextLoadRef.current = true;
      setPathStack(stack);
      setEntries(sorted);
    } catch (err) {
      handleApiError(err, `Cannot navigate to "${normalized}"`);
      setPathInputValue(currentPath);
    } finally {
      setLoading(false);
    }
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
    setSelected(prev =>
      prev.size === entries.length ? new Set() : new Set(entries.map(e => e.name))
    );
  };

  const selectedEntries = entries.filter(e => selected.has(e.name));
  const hasSelection = selected.size > 0;

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
      handleApiError(err, 'Delete failed');
      setModal({ type: 'none' });
    } finally {
      setOpLoading(false);
    }
  };

  const handleRename = async () => {
    if (modal.type !== 'rename' || !renameValue.trim()) return;
    const oldPath = absPath(modal.entry.name);
    const newPath =
      currentPath === '/' ? `/${renameValue.trim()}` : `${currentPath}/${renameValue.trim()}`;
    try {
      setOpLoading(true);
      await remoteConnectionAPI.renameFile(host.sessionId, oldPath, newPath);
      setModal({ type: 'none' });
      setRenameValue('');
      await loadDirectory(currentPath);
      setSuccessMsg(`Renamed to "${renameValue.trim()}"`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      handleApiError(err, 'Rename failed');
      setModal({ type: 'none' });
    } finally {
      setOpLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    const newPath =
      currentPath === '/' ? `/${folderName.trim()}` : `${currentPath}/${folderName.trim()}`;
    try {
      setOpLoading(true);
      await remoteConnectionAPI.createDirectory(host.sessionId, newPath);
      setModal({ type: 'none' });
      setFolderName('');
      await loadDirectory(currentPath);
      setSuccessMsg(`Folder "${folderName.trim()}" created`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      handleApiError(err, 'Create folder failed');
      setModal({ type: 'none' });
    } finally {
      setOpLoading(false);
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName.trim()) return;
    const newPath =
      currentPath === '/' ? `/${newFileName.trim()}` : `${currentPath}/${newFileName.trim()}`;
    try {
      setOpLoading(true);
      await remoteConnectionAPI.writeFile(host.sessionId, newPath, '');
      setModal({ type: 'none' });
      setNewFileName('');
      await loadDirectory(currentPath);
      setSuccessMsg(`File "${newFileName.trim()}" created`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      handleApiError(err, 'Create file failed');
      setModal({ type: 'none' });
    } finally {
      setOpLoading(false);
    }
  };

  const handleDownload = async (entry: FileEntry) => {
    try {
      await remoteConnectionAPI.downloadFile(host.sessionId, absPath(entry.name), entry.name);
    } catch (err) {
      handleApiError(err, 'Download failed');
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let wasCancelled = false;
    try {
      setOpLoading(true);
      setShowTransfers(true);
      for (const file of Array.from(files)) {
        const remotePath = absPath(file.name);
        const controller = new AbortController();
        uploadAbortControllers.current.set(remotePath, controller);
        try {
          await remoteConnectionAPI.uploadFile(host.sessionId, remotePath, file, controller.signal);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            wasCancelled = true;
            break; // stop remaining files in the queue
          }
          throw err; // re-throw real errors
        } finally {
          uploadAbortControllers.current.delete(remotePath);
        }
      }
      await loadDirectory(currentPath);
      const updated = await remoteConnectionAPI.getTransfers(host.sessionId);
      setTransfers(updated);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        handleApiError(err, 'Upload failed');
      }
    } finally {
      setOpLoading(false);
      if (wasCancelled) {
        // Refresh so cancelled state is reflected without showing an error
        try {
          const list = await remoteConnectionAPI.getTransfers(host.sessionId);
          setTransfers(list);
        } catch { /* non-critical */ }
      }
    }
  };

  const refreshTransfers = async () => {
    try {
      const list = await remoteConnectionAPI.getTransfers(host.sessionId);
      setTransfers(list);
    } catch { /* non-critical */ }
  };

  const handleCancelTransfer = async (transferId: string) => {
    try {
      await remoteConnectionAPI.cancelTransfer(host.sessionId, transferId);
      // Abort the in-flight fetch so we stop sending bytes to the server
      const transfer = transfers.find(t => t.transferId === transferId);
      if (transfer) {
        const controller = uploadAbortControllers.current.get(transfer.remotePath);
        if (controller) {
          controller.abort();
          uploadAbortControllers.current.delete(transfer.remotePath);
        }
      }
      const list = await remoteConnectionAPI.getTransfers(host.sessionId);
      setTransfers(list);
    } catch { /* non-critical */ }
  };

  const handleClearTransfers = () => setTransfers([]);

  // Auto-poll transfers while the panel is open and any transfer is active
  const hasActiveTransfers = transfers.some(
    t => t.state === 'PENDING' || t.state === 'IN_PROGRESS',
  );
  useEffect(() => {
    if (!showTransfers) return;
    if (!hasActiveTransfers && !opLoading) return;
    const id = setInterval(async () => {
      try {
        const list = await remoteConnectionAPI.getTransfers(host.sessionId);
        setTransfers(list);
      } catch { /* non-critical */ }
    }, 1500);
    return () => clearInterval(id);
  }, [showTransfers, hasActiveTransfers, opLoading, host.sessionId]);

  // ── Breadcrumb segments ────────────────────────────────────────────
  const breadcrumbSegments = pathStack.map((p, i) => ({
    label: i === 0 ? host.userAtIp : p.split('/').filter(Boolean).pop() ?? p,
    index: i,
  }));

  // ── Editor: determine what to open ────────────────────────────────
  const handleOpenInEditor = () => {
    const selectedFiles = selectedEntries.filter(e => e.type === 'FILE');
    if (selectedFiles.length > 0) {
      setEditorState({ mode: 'files', paths: selectedFiles.map(e => absPath(e.name)) });
    } else {
      setEditorState({ mode: 'folder', folderPath: currentPath });
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#161923] relative">

      {/* Header */}
      <FileBrowserHeader
        breadcrumbSegments={breadcrumbSegments}
        pathInputValue={pathInputValue}
        loading={loading}
        onClose={onClose}
        onBreadcrumbClick={navigateToBreadcrumb}
        onPathInputChange={setPathInputValue}
        onPathInputKeyDown={e => {
          if (e.key === 'Enter') void navigateToAbsPath(pathInputValue);
          if (e.key === 'Escape') setPathInputValue(currentPath);
        }}
        onNavigateToPath={() => void navigateToAbsPath(pathInputValue)}
        onRefresh={() => loadDirectory(currentPath)}
      />

      {/* Toolbar */}
      <FileBrowserToolbar
        opLoading={opLoading}
        hasSelection={hasSelection}
        selectedEntries={selectedEntries}
        transfers={transfers}
        currentPath={currentPath}
        onUpload={handleUpload}
        onNewFolder={() => { setFolderName(''); setModal({ type: 'newFolder' }); }}
        onNewFile={() => { setNewFileName(''); setModal({ type: 'newFile' }); }}
        onDownload={handleDownload}
        onRename={entry => { setRenameValue(entry.name); setModal({ type: 'rename', entry }); }}
        onDelete={entriesToDelete => setModal({ type: 'delete', entries: entriesToDelete })}
        onToggleTransfers={() => { setShowTransfers(v => !v); if (!showTransfers) refreshTransfers(); }}
        onOpenInEditor={handleOpenInEditor}
      />

      {/* Error banner */}
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

      {/* Success banner */}
      {successMsg && (
        <div className="mx-4 mt-3 bg-green-900/30 border border-green-700/50 rounded p-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="check_circle" className="text-green-400 text-base" />
            <span className="text-xs text-green-200">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="cursor-pointer">
            <Icon name="close" className="text-green-400 text-sm" />
          </button>
        </div>
      )}

      {/* Transfers panel */}
      {showTransfers && (
        <div className="mx-4 mt-3 bg-[#1E2130] border border-[#2E3348] rounded shrink-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#2E3348]">
            <span className="label">Transfer History</span>
            <div className="flex items-center gap-2">
              <button title="Refresh transfer list" onClick={refreshTransfers} className="cursor-pointer">
                <Icon name="refresh" className="text-slate-500 text-sm hover:text-slate-300" />
              </button>
              <button title="Clear all transfers" onClick={handleClearTransfers} className="cursor-pointer">
                <Icon name="delete_sweep" className="text-slate-500 text-sm hover:text-slate-300" />
              </button>
              <button title="Close panel" onClick={() => setShowTransfers(false)} className="cursor-pointer">
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
                  {t.state !== 'CANCELLED' && (
                    <div className="w-24">
                      <div className="prog-track">
                        <div
                          className={t.state === 'COMPLETED' ? 'prog-done' : 'prog-fill'}
                          style={{ width: `${t.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <span className={`label ${t.state === 'CANCELLED' ? 'w-40' : 'w-16'} text-right ${
                    t.state === 'COMPLETED' ? 'text-[#4ade80]' :
                    t.state === 'FAILED' ? 'text-red-400' :
                    t.state === 'CANCELLED' ? 'text-slate-500' :
                    t.state === 'IN_PROGRESS' ? 'text-[#4F8EF7]' : ''
                  }`}>
                    {t.state === 'IN_PROGRESS' ? `${t.progressPercent}%` : t.state}
                  </span>
                  {(t.state === 'PENDING' || t.state === 'IN_PROGRESS') && (
                    <button
                      onClick={() => void handleCancelTransfer(t.transferId)}
                      title="Cancel upload"
                      className="cursor-pointer shrink-0"
                    >
                      <Icon name="cancel" className="text-sm text-slate-500 hover:text-red-400 transition-colors" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Column Headers */}
      <div className="grid grid-cols-[24px_auto_1fr_auto_auto_auto_auto] items-center gap-x-4 gap-y-0 px-4 py-2 border-b border-[#2E3348] shrink-0">
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
        <span className="label w-28 text-right">Actions</span>
      </div>

      {/* Back row (when not at root) */}
      {pathStack.length > 1 && (
        <button
          onClick={navigateBack}
          className="grid grid-cols-[24px_auto_1fr_auto_auto_auto_auto] items-center gap-x-4 gap-y-0 px-4 py-2 hover:bg-white/5 transition-colors cursor-pointer border-b border-[#2E3348] text-left shrink-0"
        >
          <div className="w-3.5" />
          <Icon name="arrow_upward" className="text-slate-500 text-base" />
          <span className="text-xs font-mono text-slate-500">..</span>
          <span className="w-20" /><span className="w-28" /><span className="w-20" /><span className="w-28" />
        </button>
      )}

      {/* Directory Entries */}
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
          const isDir      = entry.type === 'DIRECTORY';
          const isSymlink  = entry.type === 'SYMLINK';
          const isSelected = selected.has(entry.name);
          const iconName   = isDir ? 'folder' : isSymlink ? 'link' : getFileIcon(entry.name);
          const iconColor  = isDir ? 'text-[#E07B39]' : isSymlink ? 'text-[#4F8EF7]' : 'text-slate-400';

          return (
            <div
              key={i}
              className={`group grid grid-cols-[24px_auto_1fr_auto_auto_auto_auto] items-center gap-x-4 gap-y-0 px-4 py-2 border-b border-[#2E3348]/50 transition-colors ${
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

              {/* Size — directories don't have a meaningful flat size, show — */}
              <span className="text-xs font-mono text-slate-500 w-20 text-right">
                {isDir ? '—' : formatSize(entry.sizeBytes)}
              </span>

              {/* Modified */}
              <span className="text-xs font-mono text-slate-500 w-28 text-right">
                {formatDate(entry.lastModified)}
              </span>

              {/* Perms */}
              <span className="text-xs font-mono text-slate-500 w-20 text-right">
                {entry.permissions ?? '—'}
              </span>

              {/* Row actions (shown on hover or selection) */}
              <div className="w-28 flex items-center justify-end gap-1">
                <div className={`items-center gap-1 ${isSelected ? 'flex' : 'hidden group-hover:flex'}`}>
                  {entry.type === 'FILE' && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDownload(entry); }}
                      className="pl-3 pr-2 py-1 hover:bg-white/10 rounded cursor-pointer"
                      title="Download"
                    >
                      <Icon name="download" className="text-slate-400 hover:text-[#4ade80] text-sm" />
                    </button>
                  )}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setRenameValue(entry.name);
                      setModal({ type: 'rename', entry });
                    }}
                    className="px-2 py-1 hover:bg-white/10 rounded cursor-pointer"
                    title="Rename"
                  >
                    <Icon name="drive_file_rename_outline" className="text-slate-400 hover:text-[#4F8EF7] text-sm" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setModal({ type: 'delete', entries: [entry] }); }}
                    className="px-2 py-1 hover:bg-white/10 rounded cursor-pointer"
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

      {/* Footer */}
      <div className="border-t border-[#2E3348] px-4 py-2 flex items-center justify-between shrink-0">
        <span className="label">{currentPath}</span>
        <span className="label">
          {hasSelection ? `${selected.size} selected · ` : ''}{entries.length} items
        </span>
      </div>

      {/* Modals */}
      <FileBrowserModals
        modal={modal}
        opLoading={opLoading}
        renameValue={renameValue}
        folderName={folderName}
        newFileName={newFileName}
        onModalClose={() => setModal({ type: 'none' })}
        onRenameValueChange={setRenameValue}
        onFolderNameChange={setFolderName}
        onNewFileNameChange={setNewFileName}
        onDelete={handleDelete}
        onRename={handleRename}
        onCreateFolder={handleCreateFolder}
        onCreateFile={handleCreateFile}
      />

      {/* Remote Editor overlay */}
      {editorState !== null && (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ background: '#0f1117' }}>
          <RemoteEditor
            sessionId={host.sessionId}
            {...(editorState.mode === 'folder'
              ? { folderPath: editorState.folderPath }
              : { initialPaths: editorState.paths }
            )}
            onClose={() => setEditorState(null)}
          />
        </div>
      )}
    </div>
  );
}
