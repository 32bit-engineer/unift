// Shared Icon component used across RemoteHostsManager sub-components
export interface IconProps {
  name: string;
  className?: string;
  filled?: boolean;
}

export function Icon({ name, className = 'text-base', filled = false }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
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
    active: 'bg-blue-900/40 text-[#4F8EF7] border border-blue-700/40',
    warning: 'bg-orange-900/40 text-[#E07B39] border border-orange-700/40',
  };
  return (
    <span className={`px-2 py-1 rounded text-xs font-mono uppercase tracking-wider ${classes[variant]}`}>
      {children}
    </span>
  );
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
