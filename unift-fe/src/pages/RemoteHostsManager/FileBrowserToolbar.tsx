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
}

export function FileBrowserToolbar({
  opLoading,
  hasSelection,
  selectedEntries,
  transfers,
  currentPath,
  onUpload,
  onNewFolder,
  onNewFile,
  onDownload,
  onRename,
  onDelete,
  onToggleTransfers,
  onOpenInEditor,
}: FileBrowserToolbarProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const selectedFiles = selectedEntries.filter(e => e.type === 'FILE');

  return (
    <div className="bg-[#1E2130] border-b border-[#2E3348] px-4 py-2 flex items-center gap-2 shrink-0 flex-wrap">
      {/* Hidden file input for upload */}
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => onUpload(e.target.files)}
      />

      {/* Upload */}
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
        onClick={onNewFolder}
        disabled={opLoading}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-40 cursor-pointer"
      >
        <Icon name="create_new_folder" className="text-sm" />
        New Folder
      </button>

      {/* New file */}
      <button
        onClick={onNewFile}
        disabled={opLoading}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-colors disabled:opacity-40 cursor-pointer"
      >
        <Icon name="note_add" className="text-sm" />
        New File
      </button>

      {/* Separator */}
      <div className="w-px h-5 bg-[#2E3348]" />

      {/* Download — single file only */}
      {hasSelection && selectedEntries.length === 1 && selectedEntries[0].type === 'FILE' && (
        <button
          onClick={() => onDownload(selectedEntries[0])}
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
          onClick={() => onRename(selectedEntries[0])}
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
          onClick={() => onDelete(selectedEntries)}
          disabled={opLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-red-800/60 rounded text-[10px] font-mono uppercase tracking-widest text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40 cursor-pointer"
        >
          <Icon name="delete" className="text-sm" />
          Delete ({selectedEntries.length})
        </button>
      )}

      <div className="flex-1" />

      {/* Transfers toggle */}
      <button
        onClick={onToggleTransfers}
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

      {/* Open in Editor */}
      <button
        onClick={onOpenInEditor}
        title={
          selectedFiles.length > 0
            ? `Open ${selectedFiles.length} selected file${selectedFiles.length > 1 ? 's' : ''} in editor`
            : `Open folder "${currentPath}" in editor`
        }
        className="flex items-center gap-1.5 px-3 py-1.5 border rounded text-[10px] font-mono uppercase tracking-widest transition-colors border-[#4F8EF7]/40 text-[#4F8EF7] hover:bg-[#4F8EF7]/10 cursor-pointer"
      >
        <Icon name="code" className="text-sm" />
        Open in Editor
      </button>
    </div>
  );
}
