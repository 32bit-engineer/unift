// Shared Icon component used across RemoteHostsManager sub-components
export interface IconProps {
  name: string;
  className?: string;
  filled?: boolean;
}

export function Icon({ name, className = 'text-base', filled = false }: IconProps) {
  return (
    <span
      className={`material-symbols-rounded ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
    >
      {name}
    </span>
  );
}

// Shared Badge component used in session list rows
export interface BadgeProps {
  variant: 'active' | 'warning';
  children: React.ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  const classes = {
    active: 'bg-blue-900/40 text-[#7C6DFA] border border-blue-700/40',
    warning: 'bg-orange-900/40 text-[#E07B39] border border-orange-700/40',
  };
  return (
    <span className={`px-2 py-1 rounded text-xs font-mono uppercase tracking-wider ${classes[variant]}`}>
      {children}
    </span>
  );
}

// Returns a Tailwind colour class for a file/directory icon
export function getFileIconColor(name: string, type: 'FILE' | 'DIRECTORY' | 'SYMLINK'): string {
  if (type === 'DIRECTORY') return 'text-[#26A69A]';
  if (type === 'SYMLINK') return 'text-[#7C6DFA]';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    js: 'text-yellow-400',  jsx: 'text-yellow-400',
    ts: 'text-blue-400',    tsx: 'text-blue-400',
    html: 'text-orange-400', htm: 'text-orange-400',
    css: 'text-sky-400',    scss: 'text-pink-400',
    py: 'text-emerald-400', java: 'text-orange-500',
    go: 'text-cyan-400',    rs: 'text-orange-600',
    json: 'text-[#26A69A]',
    yaml: 'text-emerald-300', yml: 'text-emerald-300',
    xml: 'text-amber-400',  md: 'text-slate-300',
    txt: 'text-slate-400',  sh: 'text-green-400',
    bash: 'text-green-400', conf: 'text-[#7C6DFA]',
    ini: 'text-[#7C6DFA]',  cfg: 'text-[#7C6DFA]',
    env: 'text-green-400',  pdf: 'text-red-400',
    zip: 'text-amber-400',  tar: 'text-amber-400',
    gz: 'text-amber-400',   rar: 'text-amber-400',
    sql: 'text-violet-400',
    png: 'text-pink-300',   jpg: 'text-pink-300',
    jpeg: 'text-pink-300',  gif: 'text-pink-300',
    svg: 'text-orange-300', webp: 'text-pink-300',
    mp4: 'text-purple-400', mkv: 'text-purple-400',
    avi: 'text-purple-400', mp3: 'text-purple-300',
    wav: 'text-purple-300',
  };
  return map[ext] ?? 'text-[#4A5275]';
}

// Returns a human-readable file type label for the Type column
export function getFileTypeLabel(name: string, type: 'FILE' | 'DIRECTORY' | 'SYMLINK'): string {
  if (type === 'DIRECTORY') return 'Directory';
  if (type === 'SYMLINK') return 'Symlink';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    js: 'JavaScript',  jsx: 'JavaScript',
    ts: 'TypeScript',  tsx: 'TypeScript',
    html: 'HTML',      htm: 'HTML',
    css: 'CSS',        scss: 'SCSS',
    py: 'Python',      java: 'Java',
    go: 'Go',          rs: 'Rust',
    cpp: 'C++',        cc: 'C++',
    h: 'C Header',     c: 'C',
    json: 'JSON Config',
    yaml: 'YAML Config', yml: 'YAML Config',
    xml: 'XML',        md: 'Markdown', mdx: 'Markdown',
    txt: 'Plain Text', sh: 'Shell Script',
    bash: 'Shell Script',
    conf: 'Config File', ini: 'Config File', cfg: 'Config File',
    env: 'Environment',
    pdf: 'PDF',
    zip: 'Archive', tar: 'Archive', gz: 'Archive', rar: 'Archive',
    sql: 'SQL',
    png: 'PNG Image', jpg: 'JPEG Image', jpeg: 'JPEG Image',
    gif: 'GIF Image', svg: 'SVG Image', webp: 'WebP Image',
    mp4: 'Video',  mkv: 'Video',  avi: 'Video',
    mp3: 'Audio',  wav: 'Audio',  flac: 'Audio',
  };
  if (ext in map) return map[ext];
  if (ext) return `${ext.toUpperCase()} File`;
  return 'File';
}

// Map a file extension to a Material Symbol icon name
export function getFileIcon(name: string): string {
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

// Format a byte count into a human-readable string.
// A value of -1 (or any negative number) means "not computed" (e.g. directories)
// and is rendered as "—" to avoid showing the misleading inode metadata size.
export function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Format an ISO date string as a short locale date
export function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
