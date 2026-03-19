import { Icon } from './shared';
import type { ModalState, FileEntry } from './types';

interface FileBrowserModalsProps {
  modal: ModalState;
  opLoading: boolean;
  renameValue: string;
  folderName: string;
  newFileName: string;
  onModalClose: () => void;
  onRenameValueChange: (value: string) => void;
  onFolderNameChange: (value: string) => void;
  onNewFileNameChange: (value: string) => void;
  onDelete: () => void;
  onRename: () => void;
  onCreateFolder: () => void;
  onCreateFile: () => void;
}

export function FileBrowserModals({
  modal,
  opLoading,
  renameValue,
  folderName,
  newFileName,
  onModalClose,
  onRenameValueChange,
  onFolderNameChange,
  onNewFileNameChange,
  onDelete,
  onRename,
  onCreateFolder,
  onCreateFile,
}: FileBrowserModalsProps) {
  return (
    <>
      {/* Delete Confirm Modal */}
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
                onClick={onModalClose}
                disabled={opLoading}
                className="px-4 py-2 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
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

      {/* Rename Modal */}
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
              onChange={e => onRenameValueChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onRename();
                if (e.key === 'Escape') onModalClose();
              }}
              className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={onModalClose}
                disabled={opLoading}
                className="px-4 py-2 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={onRename}
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

      {/* New Folder Modal */}
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
              onChange={e => onFolderNameChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onCreateFolder();
                if (e.key === 'Escape') onModalClose();
              }}
              placeholder="my-folder"
              className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={onModalClose}
                disabled={opLoading}
                className="px-4 py-2 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={onCreateFolder}
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

      {/* New File Modal */}
      {modal.type === 'newFile' && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1E2130] border border-[#2E3348] rounded w-96 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="note_add" className="text-[#4F8EF7] text-2xl" />
              <h3 className="text-sm font-bold text-[#E2E8F0] uppercase tracking-wider">New File</h3>
            </div>
            <label className="label block mb-1">File Name</label>
            <input
              autoFocus
              value={newFileName}
              onChange={e => onNewFileNameChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onCreateFile();
                if (e.key === 'Escape') onModalClose();
              }}
              placeholder="e.g. index.ts"
              className="w-full bg-[#11141C] border border-[#2E3348] rounded depth-input px-3 py-2 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-[#4F8EF7]/40 outline-none transition-all mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={onModalClose}
                disabled={opLoading}
                className="px-4 py-2 border border-[#2E3348] rounded text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={onCreateFile}
                disabled={opLoading || !newFileName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#4F8EF7] rounded text-[10px] font-mono uppercase tracking-widest text-white hover:brightness-110 transition-all cursor-pointer disabled:opacity-40"
              >
                {opLoading && <Icon name="hourglass_bottom" className="text-sm animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Re-export for convenience
export type { FileEntry };
