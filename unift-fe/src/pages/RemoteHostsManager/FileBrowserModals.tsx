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
          <div className="bg-[#13131E] border border-[#1E1E2E] rounded w-96 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="warning" className="text-red-400 text-2xl" />
              <h3 className="text-heading text-[16px]">Confirm Delete</h3>
            </div>
            <p className="text-ui-sm mb-4">
              Permanently delete{' '}
              {modal.entries.length === 1
                ? <span className="text-code">"{modal.entries[0].name}"</span>
                : <span className="text-code">{modal.entries.length} items</span>
              }? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={onModalClose}
                disabled={opLoading}
                className="px-4 py-2 border border-[#1E1E2E] rounded text-micro text-primary hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                disabled={opLoading}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 rounded text-micro text-white hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-40"
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
          <div className="bg-[#13131E] border border-[#1E1E2E] rounded w-96 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="drive_file_rename_outline" className="text-[#7C6DFA] text-2xl" />
              <h3 className="text-heading text-[16px]">Rename</h3>
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
              className="w-full bg-[#0C0C14] border border-[#1E1E2E] rounded depth-input px-3 py-2 text-code text-primary placeholder:text-muted focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={onModalClose}
                disabled={opLoading}
                className="px-4 py-2 border border-[#1E1E2E] rounded text-micro text-primary hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={onRename}
                disabled={opLoading || !renameValue.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#7C6DFA] rounded text-micro text-white hover:brightness-110 transition-all cursor-pointer disabled:opacity-40"
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
          <div className="bg-[#13131E] border border-[#1E1E2E] rounded w-96 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="create_new_folder" className="text-[#E07B39] text-2xl" />
              <h3 className="text-heading text-[16px]">New Folder</h3>
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
              className="w-full bg-[#0C0C14] border border-[#1E1E2E] rounded depth-input px-3 py-2 text-code text-primary placeholder:text-muted focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={onModalClose}
                disabled={opLoading}
                className="px-4 py-2 border border-[#1E1E2E] rounded text-micro text-primary hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={onCreateFolder}
                disabled={opLoading || !folderName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#E07B39] rounded text-micro text-white hover:brightness-110 transition-all cursor-pointer disabled:opacity-40"
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
          <div className="bg-[#13131E] border border-[#1E1E2E] rounded w-96 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Icon name="note_add" className="text-[#7C6DFA] text-2xl" />
              <h3 className="text-heading text-[16px]">New File</h3>
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
              className="w-full bg-[#0C0C14] border border-[#1E1E2E] rounded depth-input px-3 py-2 text-code text-primary placeholder:text-muted focus:ring-1 focus:ring-[#7C6DFA]/40 outline-none transition-all mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={onModalClose}
                disabled={opLoading}
                className="px-4 py-2 border border-[#1E1E2E] rounded text-micro text-primary hover:bg-white/5 transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={onCreateFile}
                disabled={opLoading || !newFileName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#7C6DFA] rounded text-micro text-white hover:brightness-110 transition-all cursor-pointer disabled:opacity-40"
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
