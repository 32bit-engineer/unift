/**
 * Class Name Utilities
 * Helper functions for conditional classname combinations
 */

export function cn(...classes: (string | undefined | null | boolean)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Format file size to human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format seconds to time string (MM:SS or HH:MM:SS)
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format date to readable string
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Get file icon based on mime type
 */
export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video_file';
  if (mimeType.startsWith('audio/')) return 'audio_file';
  if (mimeType.includes('pdf')) return 'picture_as_pdf';
  if (mimeType.includes('spreadsheet') || mimeType.includes('sheet')) return 'table_chart';
  if (mimeType.includes('document') || mimeType.includes('word')) return 'description';
  if (mimeType.includes('archive') || mimeType.includes('zip')) return 'folder_zip';
  
  return 'description';
}

/**
 * Get status badge color
 */
export function getStatusColor(status: string): string {
  const statusMap: Record<string, string> = {
    'completed': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    'failed': 'bg-red-500/20 text-red-400 border-red-500/30',
    'in-progress': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'pending': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'paused': 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };
  
  return statusMap[status] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
}

/**
 * Calculate transfer ETA
 */
export function calculateETA(remainingBytes: number, speedBytesPerSecond: number): string {
  if (speedBytesPerSecond <= 0) return 'calculating...';
  
  const seconds = Math.ceil(remainingBytes / speedBytesPerSecond);
  return formatTime(seconds);
}

/**
 * Format speed to human readable format
 */
export function formatSpeed(bytesPerSecond: number): string {
  return formatFileSize(bytesPerSecond) + '/s';
}
