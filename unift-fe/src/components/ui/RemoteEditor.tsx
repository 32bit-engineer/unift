import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { remoteConnectionAPI, type DirectoryListingResponse } from '@/utils/remoteConnectionAPI';

// ─── Language detection ────────────────────────────────────────────────────
function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    py: 'python',
    java: 'java',
    go: 'go',
    rs: 'rust',
    c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    yaml: 'yaml', yml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', sass: 'sass', less: 'less',
    md: 'markdown',
    sql: 'sql',
    dockerfile: 'dockerfile',
    toml: 'ini',
    ini: 'ini', conf: 'ini', cfg: 'ini',
    env: 'ini',
    txt: 'plaintext',
    log: 'plaintext',
  };
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';
  return map[ext] ?? 'plaintext';
}

// ─── File icon helper ──────────────────────────────────────────────────────
function fileIcon(name: string, type: 'FILE' | 'DIRECTORY' | 'SYMLINK'): string {
  if (type === 'DIRECTORY') return 'folder';
  if (type === 'SYMLINK') return 'link';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'code', tsx: 'code', js: 'code', jsx: 'code', py: 'code',
    java: 'code', go: 'code', rs: 'code', c: 'code', cpp: 'code',
    cs: 'code', rb: 'code', php: 'code',
    html: 'html', css: 'css',
    json: 'data_object', xml: 'data_object', yaml: 'data_object', yml: 'data_object',
    md: 'article', txt: 'article',
    sh: 'terminal', bash: 'terminal', zsh: 'terminal',
    pdf: 'picture_as_pdf',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', svg: 'image', webp: 'image',
    mp4: 'movie', mkv: 'movie', avi: 'movie',
    mp3: 'audio_file', wav: 'audio_file',
    zip: 'folder_zip', tar: 'folder_zip', gz: 'folder_zip', rar: 'folder_zip',
    env: 'settings',
    dockerfile: 'deployed_code',
    sql: 'database',
  };
  const lower = name.toLowerCase();
  if (lower === 'dockerfile') return 'deployed_code';
  if (lower === 'makefile') return 'build';
  return map[ext] ?? 'description';
}

// ─── Types ─────────────────────────────────────────────────────────────────

type FileEntry = DirectoryListingResponse['entries'][number];

export interface EditorFile {
  path: string;
  name: string;
  content: string | null;
  draft: string;
  dirty: boolean;
  status: 'loading' | 'ready' | 'saving' | 'error';
  errorMessage?: string;
}

interface ExplorerNode {
  entry: FileEntry;
  /** children loaded for directories */
  children?: ExplorerNode[];
  expanded: boolean;
  loading: boolean;
}

export interface RemoteEditorProps {
  sessionId: string;
  /**
   * When provided, the editor opens in "folder mode": a VS Code–style file
   * explorer sidebar shows the contents of this directory and files are opened
   * by clicking them.
   */
  folderPath?: string;
  /**
   * Initial files to open as tabs directly (no folder explorer).
   * Ignored when `folderPath` is provided.
   */
  initialPaths?: string[];
  onClose: () => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function basename(path: string) {
  return path.split('/').filter(Boolean).pop() ?? path;
}

function buildInitialFile(path: string): EditorFile {
  return { path, name: basename(path), content: null, draft: '', dirty: false, status: 'loading' };
}

function joinPath(base: string, name: string) {
  return base === '/' ? `/${name}` : `${base}/${name}`;
}
void joinPath;

// ─── ExplorerTree ──────────────────────────────────────────────────────────

interface ExplorerTreeProps {
  nodes: ExplorerNode[];
  depth: number;
  activeFilePath: string | null;
  sessionId: string;
  onFileClick: (path: string) => void;
  onToggleDir: (node: ExplorerNode) => void;
}

function ExplorerTree({ nodes, depth, activeFilePath, sessionId, onFileClick, onToggleDir }: ExplorerTreeProps) {
  void sessionId;
  return (
    <>
      {nodes.map(node => {
        const isDir  = node.entry.type === 'DIRECTORY';
        const isFile = node.entry.type === 'FILE';
        const isActive = isFile && node.entry.path === activeFilePath;

        return (
          <div key={node.entry.path}>
            <button
              onClick={() => isDir ? onToggleDir(node) : isFile ? onFileClick(node.entry.path) : undefined}
              title={node.entry.path}
              className="w-full flex items-center gap-1.5 text-left transition-colors group cursor-pointer"
              style={{
                paddingLeft:  `${8 + depth * 12}px`,
                paddingRight: '8px',
                paddingTop:   '3px',
                paddingBottom: '3px',
                background: isActive ? 'rgba(79,142,247,0.12)' : 'transparent',
                borderLeft: isActive ? '2px solid #4F8EF7' : '2px solid transparent',
                color: isActive ? '#E2E8F0' : '#94a3b8',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {/* Collapse/expand arrow for directories */}
              <span
                className="material-symbols-outlined shrink-0 transition-transform"
                style={{
                  fontSize: '12px',
                  color: '#5a6380',
                  transform: isDir ? (node.expanded ? 'rotate(90deg)' : 'rotate(0deg)') : 'none',
                  opacity: isDir ? 1 : 0,
                  width: '12px',
                }}
              >
                chevron_right
              </span>

              {/* File/folder icon */}
              {node.loading ? (
                <span
                  className="material-symbols-outlined shrink-0 animate-spin"
                  style={{ fontSize: '14px', color: '#5a6380' }}
                >
                  progress_activity
                </span>
              ) : (
                <span
                  className="material-symbols-outlined shrink-0"
                  style={{
                    fontSize: '14px',
                    color: isDir ? '#E07B39' : '#4F8EF7',
                    fontVariationSettings: isDir && node.expanded
                      ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
                      : undefined,
                  }}
                >
                  {isDir ? (node.expanded ? 'folder_open' : 'folder') : fileIcon(node.entry.name, node.entry.type)}
                </span>
              )}

              <span
                className="text-[11px] font-mono truncate"
                style={{ color: isActive ? '#E2E8F0' : isDir ? '#c4cde0' : '#94a3b8' }}
              >
                {node.entry.name}
              </span>
            </button>

            {/* Render children when expanded */}
            {isDir && node.expanded && node.children && (
              <ExplorerTree
                nodes={node.children}
                depth={depth + 1}
                activeFilePath={activeFilePath}
                sessionId={sessionId}
                onFileClick={onFileClick}
                onToggleDir={onToggleDir}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

// ─── RemoteEditor ──────────────────────────────────────────────────────────

export function RemoteEditor({ sessionId, folderPath, initialPaths = [], onClose }: RemoteEditorProps) {
  const isFolderMode = folderPath !== undefined;

  // ── Tab state ────────────────────────────────────────────────────────────
  const [files, setFiles]               = useState<EditorFile[]>(() =>
    isFolderMode ? [] : initialPaths.map(buildInitialFile)
  );
  const [activeIndex, setActiveIndex]   = useState(0);
  const [globalStatus, setGlobalStatus] = useState<string>('');

  // ── Explorer state (folder mode only) ────────────────────────────────────
  const [explorerNodes, setExplorerNodes] = useState<ExplorerNode[]>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError]     = useState<string | null>(null);
  const [explorerRootLabel, setExplorerRootLabel] = useState<string>('');

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // ── Load root directory (folder mode) ────────────────────────────────────
  useEffect(() => {
    if (!isFolderMode || !folderPath) return;
    setExplorerRootLabel(basename(folderPath) || folderPath);
    setExplorerLoading(true);
    setExplorerError(null);
    remoteConnectionAPI.listDirectory(sessionId, folderPath)
      .then(res => {
        const sorted = [...res.entries].sort((a, b) => {
          if (a.type === 'DIRECTORY' && b.type !== 'DIRECTORY') return -1;
          if (a.type !== 'DIRECTORY' && b.type === 'DIRECTORY') return 1;
          return a.name.localeCompare(b.name);
        });
        setExplorerNodes(sorted.map(entry => ({ entry, expanded: false, loading: false })));
      })
      .catch(err => setExplorerError(err instanceof Error ? err.message : 'Failed to load directory'))
      .finally(() => setExplorerLoading(false));
  }, [isFolderMode, folderPath, sessionId]);

  // ── Toggle directory in explorer ──────────────────────────────────────────
  const toggleExplorerDir = useCallback((target: ExplorerNode) => {
    const toggle = (nodes: ExplorerNode[]): ExplorerNode[] =>
      nodes.map(n => {
        if (n.entry.path !== target.entry.path) {
          return { ...n, children: n.children ? toggle(n.children) : undefined };
        }
        // Already expanded → collapse
        if (n.expanded) return { ...n, expanded: false };
        // Not yet loaded → fetch children
        if (!n.children) {
          const loading = { ...n, expanded: true, loading: true };
          setExplorerNodes(prev => toggle(prev).map(x => x.entry.path === n.entry.path ? loading : x));
          remoteConnectionAPI.listDirectory(sessionId, n.entry.path)
            .then(res => {
              const sorted = [...res.entries].sort((a, b) => {
                if (a.type === 'DIRECTORY' && b.type !== 'DIRECTORY') return -1;
                if (a.type !== 'DIRECTORY' && b.type === 'DIRECTORY') return 1;
                return a.name.localeCompare(b.name);
              });
              const children: ExplorerNode[] = sorted.map(entry => ({
                entry, expanded: false, loading: false,
              }));
              setExplorerNodes(prev => {
                const patch = (ns: ExplorerNode[]): ExplorerNode[] =>
                  ns.map(x => {
                    if (x.entry.path === n.entry.path) return { ...x, children, loading: false, expanded: true };
                    return { ...x, children: x.children ? patch(x.children) : undefined };
                  });
                return patch(prev);
              });
            })
            .catch(() => {
              setExplorerNodes(prev => {
                const patch = (ns: ExplorerNode[]): ExplorerNode[] =>
                  ns.map(x => {
                    if (x.entry.path === n.entry.path) return { ...x, loading: false, expanded: false };
                    return { ...x, children: x.children ? patch(x.children) : undefined };
                  });
                return patch(prev);
              });
            });
          return loading;
        }
        // Already has children → just expand
        return { ...n, expanded: true };
      });
    setExplorerNodes(prev => toggle(prev));
  }, [sessionId]);

  // ── File helpers ──────────────────────────────────────────────────────────
  const updateFile = useCallback((index: number, patch: Partial<EditorFile>) => {
    setFiles(prev => prev.map((f, i) => i === index ? { ...f, ...patch } : f));
  }, []);

  const loadFile = useCallback(async (index: number, currentFiles?: EditorFile[]) => {
    const list = currentFiles ?? files;
    const file = list[index];
    if (!file || file.status !== 'loading') return;
    try {
      const text = await remoteConnectionAPI.readFile(sessionId, file.path);
      setFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, content: text, draft: text, dirty: false, status: 'ready' } : f
      ));
    } catch (err) {
      setFiles(prev => prev.map((f, i) =>
        i === index
          ? { ...f, status: 'error', errorMessage: err instanceof Error ? err.message : 'Load failed' }
          : f
      ));
    }
  }, [files, sessionId]);

  // Load content when active tab changes
  useEffect(() => {
    void loadFile(activeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // ── Open file from explorer ───────────────────────────────────────────────
  const openFileFromExplorer = useCallback((path: string) => {
    setFiles(prev => {
      const existing = prev.findIndex(f => f.path === path);
      if (existing >= 0) {
        setActiveIndex(existing);
        return prev;
      }
      const newFile = buildInitialFile(path);
      const newFiles = [...prev, newFile];
      const newIndex = newFiles.length - 1;
      setActiveIndex(newIndex);
      // Trigger load after state is committed
      setTimeout(() => void loadFile(newIndex, newFiles), 0);
      return newFiles;
    });
  }, [loadFile]);

  // ── Save ─────────────────────────────────────────────────────────────────
  const saveFile = useCallback(async (index: number) => {
    const file = files[index];
    if (!file || file.status === 'loading' || !file.dirty) return;
    updateFile(index, { status: 'saving' });
    setGlobalStatus('Saving…');
    try {
      await remoteConnectionAPI.writeFile(sessionId, file.path, file.draft);
      setFiles(prev => prev.map((f, i) =>
        i === index ? { ...f, content: f.draft, dirty: false, status: 'ready' } : f
      ));
      setGlobalStatus('Saved');
      setTimeout(() => setGlobalStatus(''), 2000);
    } catch (err) {
      updateFile(index, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Save failed' });
      setGlobalStatus('Save failed');
    }
  }, [files, sessionId, updateFile]);

  // ── Ctrl+S ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void saveFile(activeIndex);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeIndex, saveFile]);

  // ── Close ─────────────────────────────────────────────────────────────────
  const handleClose = () => {
    setFiles([]);
    setActiveIndex(0);
    setGlobalStatus('');
    editorRef.current = null;
    onClose();
  };

  // ── Close tab ─────────────────────────────────────────────────────────────
  const closeTab = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (files.length === 1 && !isFolderMode) { handleClose(); return; }
    setFiles(prev => prev.filter((_, i) => i !== index));
    setActiveIndex(prev => Math.min(prev, files.length - 2));
  };

  // ── Monaco mount ──────────────────────────────────────────────────────────
  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.addCommand(2097 | 49, () => { void saveFile(activeIndex); });
  };

  const activeFile = files[activeIndex];
  const activeFilePath = activeFile?.path ?? null;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#0f1117' }}>

      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-0 shrink-0 select-none"
        style={{ background: '#161923', borderBottom: '1px solid #2E3348', height: '38px' }}
      >
        {/* IDE label */}
        <div className="flex items-center gap-2 px-4 shrink-0" style={{ borderRight: '1px solid #2E3348' }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '16px', color: '#4F8EF7', fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
          >
            code
          </span>
          <span className="text-[11px] font-mono uppercase tracking-widest text-slate-400">
            Remote Editor
          </span>
          {isFolderMode && explorerRootLabel && (
            <>
              <span className="text-[11px] font-mono text-slate-700 mx-1">/</span>
              <span className="text-[11px] font-mono text-slate-500 truncate max-w-40">
                {explorerRootLabel}
              </span>
            </>
          )}
        </div>

        {/* Tabs — only shown when files are open */}
        {files.length > 0 && (
          <div className="flex items-stretch flex-1 overflow-x-auto min-w-0 custom-scrollbar">
            {files.map((file, i) => {
              const isActive = i === activeIndex;
              return (
                <button
                  key={file.path}
                  onClick={() => setActiveIndex(i)}
                  className="flex items-center gap-2 px-4 shrink-0 cursor-pointer transition-colors group"
                  style={{
                    height: '38px',
                    background: isActive ? '#0f1117' : 'transparent',
                    borderRight: '1px solid #2E3348',
                    borderBottom: isActive ? '1px solid #0f1117' : '1px solid transparent',
                    borderTop: isActive ? '1px solid #4F8EF7' : '1px solid transparent',
                    marginBottom: isActive ? '-1px' : '0',
                    color: isActive ? '#E2E8F0' : '#5a6380',
                  }}
                >
                  <span className="text-[11px] font-mono whitespace-nowrap">{file.name}</span>
                  {file.dirty && (
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#E07B39' }} title="Unsaved changes" />
                  )}
                  <span
                    onClick={e => closeTab(i, e)}
                    className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ fontSize: '13px', color: '#5a6380', lineHeight: 1, cursor: 'pointer' }}
                  >
                    ×
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {files.length === 0 && <div className="flex-1" />}

        {/* Close IDE button */}
        <div className="shrink-0 flex items-center gap-2 px-3" style={{ borderLeft: '1px solid #2E3348' }}>
          <button
            onClick={handleClose}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-mono uppercase tracking-widest transition-colors cursor-pointer hover:bg-red-900/30"
            style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}
            title="Close IDE"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>close</span>
            Close Editor
          </button>
        </div>
      </div>

      {/* ── Body: [explorer?] + [editor area] ─────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── File Explorer Sidebar (folder mode only) ─────────────────────── */}
        {isFolderMode && (
          <div
            className="flex flex-col shrink-0 overflow-hidden"
            style={{
              width: '240px',
              background: '#161923',
              borderRight: '1px solid #2E3348',
            }}
          >
            {/* Explorer header */}
            <div
              className="flex items-center gap-2 px-3 py-2 shrink-0"
              style={{ borderBottom: '1px solid #2E3348' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#5a6380' }}>
                folder_open
              </span>
              <span className="label uppercase tracking-widest" style={{ fontSize: '9px' }}>
                Explorer
              </span>
            </div>

            {/* Root folder label */}
            <div
              className="flex items-center gap-1.5 px-3 py-2 shrink-0"
              style={{ borderBottom: '1px solid #1a1f2e' }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '13px', color: '#E07B39', fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
              >
                folder
              </span>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wide text-slate-300 truncate">
                {explorerRootLabel || basename(folderPath ?? '')}
              </span>
            </div>

            {/* Tree */}
            <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
              {explorerLoading && (
                <div className="flex items-center gap-2 px-4 py-3">
                  <span
                    className="material-symbols-outlined animate-spin"
                    style={{ fontSize: '14px', color: '#4F8EF7' }}
                  >
                    progress_activity
                  </span>
                  <span className="text-[10px] font-mono text-slate-600">Loading…</span>
                </div>
              )}
              {explorerError && (
                <div className="px-3 py-2">
                  <span className="text-[10px] font-mono text-red-400">{explorerError}</span>
                </div>
              )}
              {!explorerLoading && !explorerError && (
                <ExplorerTree
                  nodes={explorerNodes}
                  depth={0}
                  activeFilePath={activeFilePath}
                  sessionId={sessionId}
                  onFileClick={openFileFromExplorer}
                  onToggleDir={toggleExplorerDir}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Editor area ──────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Empty state — folder mode with no file selected */}
          {files.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ background: '#0f1117' }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '40px', color: '#2E3348' }}
              >
                code
              </span>
              <p className="text-[11px] font-mono text-slate-700 uppercase tracking-widest">
                Select a file to open
              </p>
            </div>
          )}

          {/* Editor pane — only rendered when there are open files */}
          {files.length > 0 && (
            <div className="flex-1 overflow-hidden relative">
              {/* Loading */}
              {activeFile?.status === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center gap-3" style={{ background: '#0f1117' }}>
                  <span className="material-symbols-outlined animate-spin" style={{ fontSize: '22px', color: '#4F8EF7' }}>
                    progress_activity
                  </span>
                  <span className="text-xs font-mono text-slate-500">Loading {activeFile.name}…</span>
                </div>
              )}

              {/* Error */}
              {activeFile?.status === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: '#0f1117' }}>
                  <span className="material-symbols-outlined text-2xl" style={{ color: '#f87171' }}>error</span>
                  <p className="text-xs font-mono text-red-400">{activeFile.errorMessage}</p>
                  <button
                    onClick={() => { updateFile(activeIndex, { status: 'loading' }); void loadFile(activeIndex); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono uppercase tracking-widest cursor-pointer"
                    style={{ border: '1px solid #2E3348', color: '#93a3b8' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>refresh</span>
                    Retry
                  </button>
                </div>
              )}

              {/* Monaco */}
              {(activeFile?.status === 'ready' || activeFile?.status === 'saving') && (
                <Editor
                  height="100%"
                  language={detectLanguage(activeFile.name)}
                  value={activeFile.draft}
                  theme="vs-dark"
                  onMount={handleEditorMount}
                  onChange={value => {
                    if (value === undefined) return;
                    updateFile(activeIndex, { draft: value, dirty: value !== activeFile.content });
                  }}
                  options={{
                    fontFamily:                 "'IBM Plex Mono', 'Courier New', monospace",
                    fontSize:                   13,
                    lineHeight:                 22,
                    tabSize:                    2,
                    wordWrap:                   'on',
                    minimap:                    { enabled: true, scale: 1 },
                    scrollBeyondLastLine:        false,
                    renderWhitespace:           'boundary',
                    bracketPairColorization:    { enabled: true },
                    smoothScrolling:            true,
                    cursorBlinking:             'phase',
                    cursorSmoothCaretAnimation: 'on',
                    padding:                    { top: 12, bottom: 12 },
                    renderLineHighlight:        'gutter',
                    lineNumbers:                'on',
                    glyphMargin:                false,
                    folding:                    true,
                    suggest:                    { showWords: true, preview: true },
                    quickSuggestions:           { other: true, comments: true, strings: true },
                    parameterHints:             { enabled: true },
                    automaticLayout:            true,
                    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                  }}
                />
              )}
            </div>
          )}

          {/* ── Status bar ──────────────────────────────────────────────────── */}
          <div
            className="flex items-center justify-between px-4 shrink-0"
            style={{ height: '24px', background: '#161923', borderTop: '1px solid #2E3348' }}
          >
            <div className="flex items-center gap-4">
              {activeFile && (
                <span className="text-[10px] font-mono text-slate-600 truncate max-w-xs" title={activeFile.path}>
                  {activeFile.path}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {globalStatus && (
                <span
                  className="text-[10px] font-mono"
                  style={{ color: globalStatus === 'Saved' ? '#4ade80' : globalStatus === 'Save failed' ? '#f87171' : '#4F8EF7' }}
                >
                  {globalStatus}
                </span>
              )}
              {activeFile?.dirty && (
                <span className="text-[10px] font-mono" style={{ color: '#E07B39' }}>
                  ● Unsaved  <kbd className="opacity-50">Ctrl+S</kbd>
                </span>
              )}
              {activeFile && (
                <span className="text-[10px] font-mono text-slate-600 uppercase">
                  {detectLanguage(activeFile.name)}
                </span>
              )}
              <span className="text-[10px] font-mono text-slate-700">
                session:{sessionId.slice(0, 8)}…
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
