import { useState, useEffect, useCallback, useRef } from 'react';
import { remoteConnectionAPI, type TransferStatusResponse } from '@/utils/remoteConnectionAPI';
import { getErrorMessage } from '@/utils/apiClient';
import { useTransferStore } from '@/store/transferStore';
import { RemoteEditor } from '@/components/ui';
import { Icon, getFileIcon, getFileIconColor, getFileTypeLabel, formatSize, formatDate } from './shared';
import { FileBrowserHeader } from './FileBrowserHeader';
import { FileBrowserToolbar } from './FileBrowserToolbar';
import { FileBrowserModals } from './FileBrowserModals';
import { DirectoryTree } from './DirectoryTree';
import { MetadataPanel } from './MetadataPanel';
import type { UIHost, FileEntry, ModalState, EditorState } from './types';

interface FileBrowserProps {
  host: UIHost;
  onClose: () => void;
  onSessionExpired?: () => void;
  onOpenTerminal?: () => void;
}

export function FileBrowser({ host, onClose, onSessionExpired, onOpenTerminal }: FileBrowserProps) {
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
  // Entry shown in the right-side metadata panel (null = panel hidden)
  const [metaEntry, setMetaEntry]         = useState<FileEntry | null>(null);
  // Right-click context menu state
  const [contextMenu, setContextMenu]     = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  // Entry for the current directory (captured on navigate-into, used to show permissions in header)
  const [currentDirEntry, setCurrentDirEntry] = useState<FileEntry | null>(null);
  // Whether the workspace explorer tree panel is visible
  const [showTree, setShowTree]           = useState(true);

  // ── Panel resize state ─────────────────────────────────────────────
  const [treeWidth, setTreeWidth] = useState(208); // w-52 default
  const [metaWidth, setMetaWidth] = useState(320); // w-80 default

  const makeResizeHandler = (
    setter: (w: number) => void,
    minWidth: number,
    maxWidth: number,
    direction: 'right' | 'left',
  ) => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = direction === 'right' ? treeWidth : metaWidth;
    const onMove = (mv: MouseEvent) => {
      const delta = direction === 'right' ? mv.clientX - startX : startX - mv.clientX;
      setter(Math.max(minWidth, Math.min(maxWidth, startW + delta)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const handleTreeResizeMouseDown  = makeResizeHandler(setTreeWidth, 120, 400, 'right');
  const handleMetaResizeMouseDown  = makeResizeHandler(setMetaWidth, 240, 520, 'left');

  // useEffect to skip the redundant second fetch for that path.
  const skipNextLoadRef = useRef(false);

  // Keep the latest onSessionExpired in a ref so handleApiError never needs to
  // re-create when the parent re-renders (e.g. terminal state changes).
  const onSessionExpiredRef = useRef(onSessionExpired);
  useEffect(() => { onSessionExpiredRef.current = onSessionExpired; }, [onSessionExpired]);

  // Sets the error state and, if the server reports the session is gone,
  // notifies the parent so it can clean up the stale connection.
  const handleApiError = useCallback((err: unknown, fallback: string) => {
    const msg = getErrorMessage(err, fallback);
    setError(msg);
    if (msg.toLowerCase().includes('session not found')) {
      onSessionExpiredRef.current?.();
    }
  }, []); // stable — reads onSessionExpiredRef.current at call time

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
    const dirEntry = entries.find(e => e.name === dirName) ?? null;
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
      setCurrentDirEntry(dirEntry);
    } catch (err) {
      handleApiError(err, 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  };

  const navigateBack = () => {
    if (pathStack.length > 1) {
      setPathStack(prev => prev.slice(0, -1));
      setCurrentDirEntry(null);
    }
  };

  const navigateToBreadcrumb = (index: number) => {
    setPathStack(prev => prev.slice(0, index + 1));
    setCurrentDirEntry(null);
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
      setCurrentDirEntry(null);
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

  // Dismiss the context menu when Escape is pressed
  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  // Write text to the clipboard with a graceful fallback
  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  // Keep transfer list live via SSE while the panel is open and any transfer is active.
  const hasActiveTransfers = transfers.some(
    t => t.state === 'PENDING' || t.state === 'IN_PROGRESS',
  );
  useEffect(() => {
    if (!showTransfers) return;
    if (!hasActiveTransfers && !opLoading) return;
    let stop: (() => void) | null = null;
    void remoteConnectionAPI
      .streamTransfers(
        host.sessionId,
        1500,
        (list) => setTransfers(list),
        () => {
          // Non-critical; keep stale state visible.
        },
      )
      .then((s) => {
        stop = s;
      });

    return () => {
      stop?.();
    };
  }, [showTransfers, hasActiveTransfers, opLoading, host.sessionId]);

  // Mirror local transfer state to the global store so the popup stays in sync
  const { setTransfers: syncToGlobalStore } = useTransferStore();
  useEffect(() => {
    syncToGlobalStore(host.sessionId, transfers);
  }, [transfers, host.sessionId, syncToGlobalStore]);

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
    <div className="h-full flex flex-col overflow-hidden relative" style={{ background: '#0C0C14' }}>

      {/* ── Top header bar ── */}
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
        currentDirPerms={currentDirEntry?.permissions}
        onToggleTree={() => setShowTree(v => !v)}
        showTree={showTree}
      />

      {/* ── Toolbar ── */}
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
        onOpenTerminal={onOpenTerminal ?? (() => {})}
      />

      {/* ── Notification banners ── */}
      {error && (
        <div className="mx-4 mt-2 bg-red-900/25 border border-red-800/50 rounded-lg px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="error" className="text-red-400 text-sm" />
            <span className="text-xs font-mono text-red-300">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="cursor-pointer">
            <Icon name="close" className="text-red-500 hover:text-red-300 text-sm" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="mx-4 mt-2 bg-green-900/25 border border-green-800/50 rounded-lg px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="check_circle" className="text-green-400 text-sm" />
            <span className="text-xs font-mono text-green-300">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="cursor-pointer">
            <Icon name="close" className="text-green-500 hover:text-green-300 text-sm" />
          </button>
        </div>
      )}

      {/* ── Transfers inline panel (collapsible) ── */}
      {showTransfers && (
        <div className="mx-4 mt-2 rounded-lg border border-[#1E1E2E] shrink-0 overflow-hidden" style={{ background: '#0F0F1A' }}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1E1E2E]">
            <div className="flex items-center gap-2">
              <Icon name="swap_vert" className="text-[#7C6DFA] text-sm" />
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Transfer Activity</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button title="Refresh" onClick={refreshTransfers} className="cursor-pointer p-0.5 hover:bg-white/5 rounded">
                <Icon name="refresh" className="text-[#4A5275] hover:text-slate-300 text-sm" />
              </button>
              <button title="Clear" onClick={handleClearTransfers} className="cursor-pointer p-0.5 hover:bg-white/5 rounded">
                <Icon name="delete_sweep" className="text-[#4A5275] hover:text-slate-300 text-sm" />
              </button>
              <button title="Close" onClick={() => setShowTransfers(false)} className="cursor-pointer p-0.5 hover:bg-white/5 rounded">
                <Icon name="close" className="text-[#4A5275] hover:text-slate-300 text-sm" />
              </button>
            </div>
          </div>
          {transfers.length === 0 ? (
            <p className="px-4 py-3 text-xs font-mono text-[#3A3F55] text-center">No transfers yet</p>
          ) : (
            <div className="max-h-36 overflow-y-auto custom-scrollbar">
              {transfers.map(t => {
                const pct = Math.min(100, Math.max(0, t.progressPercent ?? 0));
                return (
                  <div key={t.transferId} className="flex items-center gap-3 px-4 py-1.5 border-b border-[#1E1E2E]/50">
                    <Icon
                      name={t.direction === 'UPLOAD' ? 'upload' : 'download'}
                      className={`text-sm shrink-0 ${t.direction === 'UPLOAD' ? 'text-[#7C6DFA]' : 'text-[#4ade80]'}`}
                    />
                    <span className="text-xs font-mono text-slate-300 flex-1 truncate">
                      {t.remotePath.split('/').pop()}
                    </span>
                    {t.state !== 'CANCELLED' && (
                      <div className="w-20 h-1 bg-[#1E1E2E] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${t.state === 'COMPLETED' ? 'bg-[#4ade80]' : 'bg-[#7C6DFA]'}`}
                          style={{ width: `${t.state === 'COMPLETED' ? 100 : pct}%` }}
                        />
                      </div>
                    )}
                    <span className={`text-[10px] font-mono w-14 text-right shrink-0 ${
                      t.state === 'COMPLETED' ? 'text-[#4ade80]' :
                      t.state === 'FAILED' ? 'text-red-400' :
                      t.state === 'CANCELLED' ? 'text-[#3A3F55]' :
                      'text-[#7C6DFA]'
                    }`}>
                      {t.state === 'IN_PROGRESS' ? `${pct}%` : t.state}
                    </span>
                    {(t.state === 'PENDING' || t.state === 'IN_PROGRESS') && (
                      <button onClick={() => void handleCancelTransfer(t.transferId)} className="cursor-pointer shrink-0">
                        <Icon name="cancel" className="text-xs text-[#4A5275] hover:text-red-400 transition-colors" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Three-column content area ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Workspace Explorer tree */}
        {showTree && (
          <DirectoryTree
            pathStack={pathStack}
            entries={entries}
            currentPath={currentPath}
            width={treeWidth}
            onResizeMouseDown={handleTreeResizeMouseDown}
            onHide={() => setShowTree(false)}
            onNavigate={path => {
              const parts = path.split('/').filter(Boolean);
              const stack: string[] = ['/', ...parts.map((_, i) => '/' + parts.slice(0, i + 1).join('/'))];
              if (path === '/') {
                setPathStack(['/']);
              } else {
                setPathStack(stack);
              }
              setCurrentDirEntry(null);
            }}
          />
        )}

        {/* Center: File table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Column header row */}
          <div
            className="grid items-center gap-x-3 px-4 py-2 border-b border-[#1E1E2E] shrink-0"
            style={{ gridTemplateColumns: '16px 1fr 80px 108px 120px 120px', background: '#0F0F1A' }}
          >
            <Checkbox
              checked={entries.length > 0 && selected.size === entries.length}
              indeterminate={selected.size > 0 && selected.size < entries.length}
              onChange={toggleSelectAll}
            />
            <ColHeader label="Name" />
            <ColHeader label="Size" right />
            <ColHeader label="Type" />
            <ColHeader label="Last Modified" right />
            <ColHeader label="Permissions" />
          </div>

          {/* Back / parent row */}
          {pathStack.length > 1 && (
            <button
              onClick={navigateBack}
              className="flex items-center gap-3 w-full px-4 py-2 border-b border-[#1E1E2E]/60 hover:bg-white/2 transition-colors cursor-pointer text-left shrink-0"
            >
              <span className="w-3.5 shrink-0" />
              <Icon name="arrow_upward" className="text-[#4A5275] text-sm shrink-0" />
              <span className="text-xs font-mono text-[#4A5275]">..</span>
            </button>
          )}
          {/* Entries */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading && (
              <div className="flex items-center justify-center gap-3 py-16 text-[#4A5275]">
                <Icon name="hourglass_bottom" className="text-lg animate-spin" />
                <span className="text-xs font-mono">Loading...</span>
              </div>
            )}
            {!loading && !error && entries.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 opacity-30">
                <Icon name="folder_open" className="text-4xl text-slate-500" />
                <span className="text-xs font-mono text-slate-500">Empty directory</span>
              </div>
            )}
            {!loading && entries.map((entry, i) => {
              const isDir      = entry.type === 'DIRECTORY';
              const isSelected = selected.has(entry.name);
              const isMetaOpen = metaEntry?.name === entry.name;
              const iconName   = isDir ? 'folder' : getFileIcon(entry.name);
              const iconColor  = getFileIconColor(entry.name, entry.type);
              const typeStr    = getFileTypeLabel(entry.name, entry.type);

              return (
                <div
                  key={i}
                  onClick={() => setMetaEntry(isMetaOpen ? null : entry)}
                  onContextMenu={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, entry });
                  }}
                  className={`group grid items-center gap-x-3 px-4 py-2 border-b border-[#1E1E2E]/40 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#7C6DFA]/8'
                      : isMetaOpen
                      ? 'bg-[#1E2235]'
                      : 'hover:bg-white/[0.025]'
                  }`}
                  style={{ gridTemplateColumns: '16px 1fr 80px 108px 120px 120px' }}
                >
                  {/* Checkbox */}
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleSelect(entry.name)}
                    onClick={e => e.stopPropagation()}
                  />

                  {/* Name */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`material-symbols-rounded text-base shrink-0 ${iconColor}`}
                      style={isDir ? { fontVariationSettings: "'FILL' 1" } : undefined}
                      onClick={e => { if (isDir) { e.stopPropagation(); void navigateInto(entry.name); } }}
                    >
                      {iconName}
                    </span>
                    <span
                      className={`text-xs font-mono truncate ${
                        isDir
                          ? 'text-slate-300 hover:text-white cursor-pointer'
                          : 'text-slate-400'
                      }`}
                      onClick={e => { if (isDir) { e.stopPropagation(); void navigateInto(entry.name); } }}
                    >
                      {entry.name}
                      {isDir && <span className="text-[#3A3F55]">/</span>}
                    </span>
                  </div>

                  {/* Size */}
                  <span className="text-xs font-mono text-[#4A5275] text-right">
                    {isDir ? '—' : formatSize(entry.sizeBytes)}
                  </span>

                  {/* Type badge */}
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono text-[#5A5082] max-w-full truncate"
                    style={{ background: '#171724', border: '1px solid #1E1E2E' }}
                  >
                    {typeStr}
                  </span>

                  {/* Last modified */}
                  <span className="text-xs font-mono text-[#4A5275] text-right">
                    {formatDate(entry.lastModified)}
                  </span>

                  {/* Permissions */}
                  <span className="text-xs font-mono text-[#4A5275]">
                    {entry.permissions ?? '—'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Status footer */}
          <div
            className="h-7 flex items-center justify-between px-4 border-t border-[#1E1E2E] shrink-0"
            style={{ background: '#0F0F1A' }}
          >
            <span className="text-[10px] font-mono text-[#3A3F55]">{currentPath}</span>
            <span className="text-[10px] font-mono text-[#3A3F55]">
              {hasSelection ? `${selected.size} selected · ` : ''}{entries.length} items
            </span>
          </div>
        </div>

        {/* Right: Metadata Panel */}
        {metaEntry && (
          <MetadataPanel
            entry={metaEntry}
            currentPath={currentPath}
            width={metaWidth}
            onResizeMouseDown={handleMetaResizeMouseDown}
            onClose={() => setMetaEntry(null)}
            onDownload={entry => handleDownload(entry)}
            onRename={entry => { setRenameValue(entry.name); setModal({ type: 'rename', entry }); setMetaEntry(null); }}
            onDelete={entry => { setModal({ type: 'delete', entries: [entry] }); setMetaEntry(null); }}
            onOpenInEditor={entry => {
              setEditorState({ mode: 'files', paths: [absPath(entry.name)] });
              setMetaEntry(null);
            }}
          />
        )}
      </div>

      {/* ── Modals ── */}
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

      {/* ── Remote Editor overlay ── */}
      {editorState !== null && (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ background: '#0f1117' }}>
          <RemoteEditor
            sessionId={host.sessionId}
            {...(editorState.mode === 'folder'
              ? { folderPath: editorState.folderPath }
              : { initialPaths: editorState.paths }
            )}
            onClose={() => setEditorState(null)}
            onOpenTerminal={onOpenTerminal}
          />
        </div>
      )}

      {/* ── Right-click context menu ── */}
      {contextMenu && (
        <>
          {/* Transparent backdrop to dismiss on outside click */}
          <div
            className="fixed inset-0 z-[99]"
            onClick={() => setContextMenu(null)}
            onContextMenu={e => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            className="fixed z-[100] bg-[#151929] border border-[#252D45] rounded-lg shadow-2xl overflow-hidden py-1.5 min-w-[190px]"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 200),
              top:  Math.min(contextMenu.y, window.innerHeight - 230),
            }}
            onClick={e => e.stopPropagation()}
          >
            <ContextMenuItem
              icon="code"
              label="Open in Editor"
              onClick={() => {
                const path = absPath(contextMenu.entry.name);
                setEditorState(
                  contextMenu.entry.type === 'DIRECTORY'
                    ? { mode: 'folder', folderPath: path }
                    : { mode: 'files', paths: [path] }
                );
                setContextMenu(null);
              }}
            />
            <ContextMenuItem
              icon="drive_file_rename_outline"
              label="Rename"
              onClick={() => {
                setRenameValue(contextMenu.entry.name);
                setModal({ type: 'rename', entry: contextMenu.entry });
                setContextMenu(null);
              }}
            />
            {contextMenu.entry.type === 'FILE' && (
              <ContextMenuItem
                icon="download"
                label="Download"
                onClick={() => { void handleDownload(contextMenu.entry); setContextMenu(null); }}
              />
            )}
            <ContextMenuItem
              icon="content_copy"
              label="Copy Path"
              onClick={() => {
                copyToClipboard(absPath(contextMenu.entry.name));
                setContextMenu(null);
              }}
            />
            <div className="h-px bg-[#252D45] my-1" />
            <ContextMenuItem
              icon="delete"
              label="Delete"
              onClick={() => {
                setModal({ type: 'delete', entries: [contextMenu.entry] });
                setContextMenu(null);
              }}
              danger
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Tiny helper components used only in the file table ────────────────────

function ColHeader({ label, right }: { label: string; right?: boolean }) {
  return (
    <span className={`text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400 ${right ? 'text-right' : ''}`}>
      {label}
    </span>
  );
}

interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  onClick?: (e: React.MouseEvent) => void;
}

function Checkbox({ checked, indeterminate, onChange, onClick }: CheckboxProps) {
  return (
    <div
      onClick={e => { onClick?.(e); onChange(); }}
      className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center cursor-pointer shrink-0 transition-all ${
        checked || indeterminate
          ? 'bg-[#7C6DFA] border-[#7C6DFA]'
          : 'bg-transparent border-[#3A3F55] hover:border-[#5B7FD8]'
      }`}
    >
      {checked && !indeterminate && (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {indeterminate && (
        <svg width="8" height="2" viewBox="0 0 8 2" fill="none">
          <path d="M1 1H7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )}
    </div>
  );
}

interface ActionBtnProps {
  icon: string;
  title: string;
  onClick: () => void;
  danger?: boolean;
}

// Kept for MetadataPanel and any other callers outside this file
function ActionBtn({ icon, title, onClick, danger }: ActionBtnProps) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`p-1 rounded cursor-pointer transition-colors hover:bg-white/10 ${
        danger ? 'hover:text-red-400 text-[#4A5275]' : 'hover:text-slate-200 text-[#4A5275]'
      }`}
    >
      <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>{icon}</span>
    </button>
  );
}
void ActionBtn;

function ContextMenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2 text-xs font-mono transition-colors cursor-pointer ${
        danger
          ? 'text-red-400 hover:bg-red-900/20'
          : 'text-slate-300 hover:bg-white/[0.06]'
      }`}
    >
      <span className="material-symbols-rounded shrink-0" style={{ fontSize: '14px' }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
