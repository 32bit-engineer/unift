import { useRef } from 'react';
import { Icon } from './shared';
import type { FileEntry, TransferStatusResponse } from './types';

interface FileBrowserToolbarProps {
  opLoading: boolean;
  hasSelection: boolean;
  selectedEntries: FileEntry[];
  transfers: TransferStatusResponse[];
  currentPath: string;
  onUpload: (files: FileList | null) => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onDownload: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entries: FileEntry[]) => void;
  onToggleTransfers: () => void;
  onOpenInEditor: () => void;
  onOpenTerminal: () => void;
}

export function FileBrowserToolbar({
  opLoading,
  hasSelection,
  selectedEntries,
  currentPath,
  onUpload,
  onNewFolder,
  onNewFile,
  onDownload,
  onRename,
  onDelete,
  onOpenInEditor,
  onOpenTerminal,
}: FileBrowserToolbarProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const selectedFiles = selectedEntries.filter(e => e.type === 'FILE');

  return (
    <div
      className="h-12 flex items-center gap-2 px-4 py-7 border-b border-[#1E1E2E] shrink-0"
      style={{ background: '#0F0F1A' }}
    >
      {/* Hidden file input for uploads */}
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => { onUpload(e.target.files); e.target.value = ''; }}
      />

      {/* Upload */}
      <button
        onClick={() => uploadInputRef.current?.click()}
        disabled={opLoading}
        title="Upload files"
        className="flex items-center gap-2 px-4 py-1.5 rounded-lg brand-gradient brand-gradient-hover brand-gradient-shadow text-ui-sm text-on-brand disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
      >
        <Icon name="upload" className="text-sm" />
        Upload
      </button>

      {/* New Folder */}
      <button
        onClick={onNewFolder}
        disabled={opLoading}
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-ui-sm text-primary bg-[#13131E] border border-[#1E1E2E] hover:bg-[#171724] hover:border-[#2A2A3F] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-[0.98]"
        title="New folder"
      >
        <Icon name="create_new_folder" className="text-sm" />
        New Folder
      </button>

      {/* New File */}
      <button
        onClick={onNewFile}
        disabled={opLoading}
        title="New file"
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-ui-sm text-primary bg-[#13131E] border border-[#1E1E2E] hover:bg-[#171724] hover:border-[#2A2A3F] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-[0.98]"
      >
        <Icon name="note_add" className="text-sm" />
        New File
      </button>

      <div className="w-px h-5 bg-[#1E1E2E] mx-1" />

      {/* Download — single file only */}
      <IconBtn
        icon="download"
        label="Download"
        disabled={opLoading || !(hasSelection && selectedEntries.length === 1 && selectedFiles.length === 1)}
        onClick={() => selectedFiles.length === 1 && onDownload(selectedFiles[0])}
      />

      {/* Rename — single item only */}
      <IconBtn
        icon="drive_file_rename_outline"
        label="Rename"
        disabled={opLoading || !(hasSelection && selectedEntries.length === 1)}
        onClick={() => selectedEntries.length === 1 && onRename(selectedEntries[0])}
      />

      {/* Delete */}
      <IconBtn
        icon="delete"
        label={`Delete${hasSelection ? ` (${selectedEntries.length})` : ''}`}
        disabled={opLoading || !hasSelection}
        onClick={() => onDelete(selectedEntries)}
        danger
      />

      <div className="flex-1" />

      {/* Open in Editor */}
      <button
        onClick={onOpenInEditor}
        title={
          selectedFiles.length > 0
            ? `Open ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} in editor`
            : `Open folder "${currentPath}" in editor`
        }
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-meta text-secondary bg-[#13131E] border border-[#1E1E2E] hover:text-accent hover:border-[#7C6DFA]/50 hover:bg-[#191927] transition-all cursor-pointer"
      >
        <Icon name="code" className="text-sm" />
        Editor
      </button>

      {/* Open Terminal */}
      <button
        onClick={onOpenTerminal}
        title="Open terminal for this session"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-meta text-secondary bg-[#13131E] border border-[#1E1E2E] hover:text-[#4ade80] hover:border-[#26A69A]/40 hover:bg-[#0F1E1A] transition-all cursor-pointer"
      >
        <Icon name="terminal" className="text-sm" />
        Terminal
      </button>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────

interface IconBtnProps {
  icon: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  danger?: boolean;
}

function IconBtn({ icon, label, disabled, onClick, danger }: IconBtnProps) {
  return (
    <button
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed active:scale-95 ${
        danger
          ? 'text-red-400 bg-[#13131E] border-[#1E1E2E] hover:bg-red-900/20 hover:border-red-800/50'
          : 'text-secondary bg-[#13131E] border-[#1E1E2E] hover:text-primary hover:bg-[#171724] hover:border-[#2A2A3F]'
      }`}
    >
      <span className="material-symbols-rounded" style={{ fontSize: '15px' }}>{icon}</span>
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-[#1E1E2E] mx-1" />;
}
void Divider;
