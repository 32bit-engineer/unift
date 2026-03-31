import type React from 'react';
import { formatSize, formatDate } from './shared';
import type { FileEntry } from './types';

interface MetadataPanelProps {
  entry: FileEntry | null;
  currentPath: string;
  onClose: () => void;
  onDownload: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onOpenInEditor: (entry: FileEntry) => void;
  /** Current panel width in px — controlled by FileBrowser via drag resize */
  width: number;
  /** Called while drag-resizing so FileBrowser can update its state */
  onResizeMouseDown: (e: React.MouseEvent) => void;
}

/*
 * Derives a human-readable MIME type guess from a file name extension.
 * This is a best-effort UI hint — no actual MIME detection.
 */
function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    conf: 'text/plain', cfg: 'text/plain', ini: 'text/plain', env: 'text/plain',
    txt: 'text/plain', md: 'text/markdown',
    json: 'application/json', xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml',
    js: 'text/javascript', ts: 'text/typescript', jsx: 'text/javascript', tsx: 'text/typescript',
    py: 'text/x-python', go: 'text/x-go', rs: 'text/x-rust', java: 'text/x-java',
    html: 'text/html', css: 'text/css',
    sh: 'application/x-sh', bash: 'application/x-sh',
    pdf: 'application/pdf',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    svg: 'image/svg+xml', webp: 'image/webp',
    mp4: 'video/mp4', mkv: 'video/x-matroska', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
    zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar',
    sql: 'application/sql',
  };
  return map[ext] ?? 'application/octet-stream';
}

/*
 * Derives a display category label for the type badge.
 */
function typeLabel(entry: FileEntry): string {
  if (entry.type === 'DIRECTORY') return 'Directory';
  if (entry.type === 'SYMLINK') return 'Symlink';
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  const labels: Record<string, string> = {
    conf: 'Config', cfg: 'Config', ini: 'Config', env: 'Config', nginx: 'Config',
    json: 'JSON', xml: 'XML', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
    js: 'JavaScript', ts: 'TypeScript', py: 'Python', go: 'Go', rs: 'Rust',
    sh: 'Shell', bash: 'Shell',
    html: 'HTML', css: 'CSS', scss: 'SCSS',
    md: 'Markdown', txt: 'Text',
    jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image', svg: 'Image',
    mp4: 'Video', mkv: 'Video', mp3: 'Audio',
    zip: 'Archive', gz: 'Archive', tar: 'Archive',
    pdf: 'PDF', sql: 'SQL',
  };
  return labels[ext] ?? 'File';
}

/*
 * Parses a unix permission octet string (e.g. "0644") and returns a list
 * of rwx breakdown objects for owner / group / others.
 */
interface PermBits {
  label: string;
  read: boolean;
  write: boolean;
  exec: boolean;
}

function parsePermissions(perms?: string): PermBits[] {
  // Accept both "0644" and "0755" (4-digit octal) or a plain 3-digit string
  const octal = perms?.replace(/^0+/, '') ?? '';
  const digits = octal.split('').map(Number);
  if (digits.length < 3) {
    return [
      { label: 'Owner', read: false, write: false, exec: false },
      { label: 'Group', read: false, write: false, exec: false },
      { label: 'Others', read: false, write: false, exec: false },
    ];
  }
  const tail = digits.slice(-3);
  return (['Owner', 'Group', 'Others'] as const).map((label, i) => {
    const v = tail[i];
    return {
      label,
      read:  (v & 4) !== 0,
      write: (v & 2) !== 0,
      exec:  (v & 1) !== 0,
    };
  });
}

/*
 * Converts a rwx breakdown into a unix-style permission string, e.g. "rw-"
 */
function rwxString(bits: PermBits): string {
  return (bits.read ? 'r' : '-') + (bits.write ? 'w' : '-') + (bits.exec ? 'x' : '-');
}

/*
 * Formats a simulated stat(1) output to display at the bottom of the panel.
 */
function buildStatOutput(entry: FileEntry, fullPath: string): string {
  const perms = entry.permissions ?? '0644';
  const size = entry.sizeBytes ?? 0;
  const blocks = Math.ceil(size / 512) || 8;
  const modified = entry.lastModified
    ? new Date(entry.lastModified).toLocaleString()
    : 'Unknown';
  return [
    `$ stat ${entry.name}`,
    `  File: ${entry.name}`,
    `  Size: ${size}\tBlocks: ${blocks}\tIO Block: 4096`,
    `Device: sda1\tInode: ${Math.floor(Math.random() * 999999 + 1000)}  Links: 1`,
    `Access: (${perms}/${rwxPermString(entry.permissions)})`,
    `Modify: ${modified}`,
    `  Path: ${fullPath}`,
  ].join('\n');
}

function rwxPermString(perms?: string): string {
  if (!perms) return '-rw-r--r--';
  const octal = perms.replace(/^0+/, '');
  const digits = octal.split('').map(Number).slice(-3);
  if (digits.length < 3) return '-rw-r--r--';
  const toRwx = (v: number) =>
    (v & 4 ? 'r' : '-') + (v & 2 ? 'w' : '-') + (v & 1 ? 'x' : '-');
  return '-' + digits.map(toRwx).join('');
}

/*
 * Returns a large Material Symbol icon name for the file type preview box.
 */
function previewIcon(entry: FileEntry): string {
  if (entry.type === 'DIRECTORY') return 'folder';
  if (entry.type === 'SYMLINK') return 'link';
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'picture_as_pdf',
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', svg: 'image',
    mp4: 'movie', mkv: 'movie', mp3: 'audio_file',
    zip: 'folder_zip', gz: 'folder_zip', tar: 'folder_zip',
    js: 'code', ts: 'code', py: 'code', go: 'code', rs: 'code',
    sh: 'terminal', bash: 'terminal',
    conf: 'settings', cfg: 'settings',
    json: 'data_object', xml: 'data_object',
    sql: 'storage',
  };
  return map[ext] ?? 'draft';
}

/*
 * Generates permission bar segments — 4 segments per entity (Owner/Group/Others)
 * coloured by r/w/x presence.
 */
function PermissionsBar({ perms }: { perms?: string }) {
  const bits = parsePermissions(perms);
  const fullLabel = bits.map(b => rwxString(b)).join(' ');

  return (
    <div>
      {/* Octal + rwx inline */}
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-mono text-2xl font-bold text-slate-200">{perms ?? '0644'}</span>
        <span className="font-mono text-xs text-slate-500">{bits.map(b => rwxString(b)).join(' ')}</span>
      </div>

      {/* Visual bar */}
      <div className="flex gap-0.5 h-2">
        {bits.map((b, i) => {
          // 4 cells per entity: a leading spacer + read + write + exec
          const cells = [
            { active: b.read,  color: i === 0 ? '#5B8BF7' : i === 1 ? '#7C6FD8' : '#888AA0' },
            { active: b.write, color: i === 0 ? '#5B8BF7' : i === 1 ? '#7C6FD8' : '#888AA0' },
            { active: b.exec,  color: i === 0 ? '#5B8BF7' : i === 1 ? '#7C6FD8' : '#888AA0' },
          ];
          return (
            <div key={i} className="flex gap-0.5 flex-1">
              {cells.map((cell, j) => (
                <div
                  key={j}
                  className="flex-1 h-full rounded-sm transition-colors"
                  style={{ background: cell.active ? cell.color : '#1E1E2E' }}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* rwx breakdown label */}
      <div className="mt-1 text-[10px] font-mono text-[#4A5275]">{fullLabel}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-micro text-muted mb-0.5">{label}</p>
      <p className="text-code truncate">{value}</p>
    </div>
  );
}

export function MetadataPanel({
  entry,
  currentPath,
  onClose,
  onDownload,
  onRename,
  onDelete,
  onOpenInEditor,
  width,
  onResizeMouseDown,
}: MetadataPanelProps) {
  if (!entry) return null;

  const fullPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`;
  const mime = entry.type === 'DIRECTORY' ? 'inode/directory' : guessMime(entry.name);
  const label = typeLabel(entry);
  const statOut = buildStatOutput(entry, fullPath);
  const icon = previewIcon(entry);
  const isFile = entry.type === 'FILE';

  // Derive owner/group from session context — we don't have real uid/gid
  // so we show "root (0)" which is the most common server default
  const owner = 'root (0)';
  const group = 'root (0)';

  return (
    <div
      className="flex flex-col border-l border-[#1E1E2E] overflow-hidden shrink-0 relative"
      style={{ background: '#13172A', width }}
    >
      {/* Left-edge drag handle */}
      <div
        onMouseDown={onResizeMouseDown}
        className="absolute top-0 left-0 w-1 h-full cursor-col-resize z-10 group"
        title="Drag to resize"
      >
        <div className="w-full h-full bg-transparent group-hover:bg-[#7C6DFA]/40 transition-colors" />
      </div>

      {/* Panel header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-[#1E1E2E] shrink-0">
        <span className="text-micro text-muted">Metadata Panel</span>
        <button onClick={onClose} className="cursor-pointer p-0.5 hover:bg-white/5 rounded transition-colors">
          <span className="material-symbols-rounded text-[#4A5275] hover:text-slate-300" style={{ fontSize: '14px' }}>
            close
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* File icon preview */}
        <div className="flex flex-col items-center pt-5 pb-4 px-4 border-b border-[#1E1E2E]">
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center mb-3"
            style={{ background: '#1E2235', border: '1px solid #1E1E2E' }}
          >
            <span
              className="material-symbols-rounded text-slate-300"
              style={{ fontSize: '32px', fontVariationSettings: "'FILL' 0" }}
            >
              {icon}
            </span>
          </div>

          <p className="text-sm font-mono text-slate-200 text-center break-all px-2 mb-2">{entry.name}</p>

          {/* Type badge */}
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider"
            style={{ background: '#1E2235', border: '1px solid #1E1E2E', color: '#8B9CC8' }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: '11px' }}>label</span>
            {label}
          </span>
        </div>

        {/* System Information */}
        <div className="px-4 pt-4 pb-3 border-b border-[#1E1E2E] space-y-3">
          <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-[#4A5275]">System Information</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <InfoRow label="Owner" value={owner} />
            <InfoRow label="Group" value={group} />
          </div>
          <InfoRow label="Full Path" value={fullPath} />
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <InfoRow label="MIME" value={mime} />
            <InfoRow label="Enc" value={mime.startsWith('text') ? 'UTF-8' : 'Binary'} />
          </div>
          {entry.sizeBytes !== undefined && entry.sizeBytes >= 0 && (
            <div className="grid grid-cols-2 gap-x-3">
              <InfoRow label="Size" value={formatSize(entry.sizeBytes)} />
              <InfoRow label="Modified" value={formatDate(entry.lastModified)} />
            </div>
          )}
        </div>

        {/* Permissions Matrix */}
        {entry.permissions && (
          <div className="px-4 pt-4 pb-3 border-b border-[#1E1E2E]">
            <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-[#4A5275] mb-3">Permissions Matrix</p>
            <PermissionsBar perms={entry.permissions} />
          </div>
        )}

        {/* Actions */}
        <div className="px-4 pt-4 pb-3 border-b border-[#1E1E2E] space-y-2">
          <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-[#4A5275] mb-3">Actions</p>

          {isFile && (
            <button
              onClick={() => onOpenInEditor(entry)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-mono text-white cursor-pointer transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #5B6FD8 0%, #7C4FD8 100%)' }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: '15px' }}>draw</span>
              Edit {label}
            </button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onDownload(entry)}
              disabled={!isFile}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-mono text-slate-300 cursor-pointer transition-colors hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed border border-[#1E1E2E]"
            >
              <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>download</span>
              Fetch
            </button>
            <button
              onClick={() => onDelete(entry)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-mono text-red-400 cursor-pointer transition-colors hover:bg-red-900/20 border border-[#3A1A1A]"
            >
              <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>delete</span>
              Purge
            </button>
          </div>

          {!isFile && (
            <button
              onClick={() => onRename(entry)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-mono text-slate-300 cursor-pointer transition-colors hover:bg-white/5 border border-[#1E1E2E]"
            >
              <span className="material-symbols-rounded" style={{ fontSize: '14px' }}>drive_file_rename_outline</span>
              Rename
            </button>
          )}
        </div>

        {/* Simulated stat output */}
        <div className="px-4 pt-4 pb-4">
          <div
            className="rounded-lg p-3 overflow-x-auto"
            style={{ background: '#0D1020', border: '1px solid #1E2235' }}
          >
            {/* Traffic-light dots */}
            <div className="flex gap-1.5 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
            </div>
            <pre className="text-[10px] font-mono text-[#4ade80] whitespace-pre leading-relaxed select-text min-w-max">
              {statOut}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
