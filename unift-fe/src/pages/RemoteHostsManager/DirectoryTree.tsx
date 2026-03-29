import { useState } from 'react';
import type React from 'react';
import type { FileEntry } from './types';
import { getFileIcon, getFileIconColor } from './shared';

interface TreeNode {
  name: string;
  path: string;
  type: 'root' | 'DIRECTORY' | 'FILE' | 'SYMLINK';
  children: TreeNode[];
  isExpanded: boolean;
}

interface DirectoryTreeProps {
  /*
   * The path stack from FileBrowser NavigationState.
   * e.g. ['/', '/etc', '/etc/nginx']
   * Used to reconstruct a tree and highlight the current path.
   */
  pathStack: string[];
  /*
   * Flat list of entries in the currently visible directory.
   * Directories in this list can be shown as expandable tree nodes.
   */
  entries: FileEntry[];
  currentPath: string;
  onNavigate: (path: string) => void;
  /** Current panel width in px — controlled by FileBrowser via drag resize */
  width: number;
  /** Optional: called when the × button is clicked to hide this panel */
  onHide?: () => void;
  /** Called while drag-resizing so FileBrowser can update its state */
  onResizeMouseDown: (e: React.MouseEvent) => void;
}

/*
 * Builds a tree representation from the path stack.
 * Each segment of the stack becomes a node; child nodes are derived from
 * the directory entries visible at that level.
 */
function buildTreeFromStack(
  pathStack: string[],
  currentEntries: FileEntry[],
  currentPath: string,
): TreeNode[] {
  const root: TreeNode = {
    name: 'root',
    path: '/',
    type: 'root',
    children: [],
    isExpanded: true,
  };

  let node = root;
  for (let i = 1; i < pathStack.length; i++) {
    const p = pathStack[i];
    const segName = p.split('/').filter(Boolean).pop() ?? p;
    const child: TreeNode = {
      name: segName,
      path: p,
      type: 'DIRECTORY',
      children: [],
      isExpanded: true,
    };
    node.children = [child];
    node = child;
  }

  // At the current path, show ALL entries (dirs + files) in the tree
  if (currentPath === pathStack[pathStack.length - 1]) {
    const leafEntries = currentEntries.map(e => ({
      name: e.name,
      path: currentPath === '/' ? `/${e.name}` : `${currentPath}/${e.name}`,
      type: e.type as 'DIRECTORY' | 'FILE' | 'SYMLINK',
      children: [],
      isExpanded: false,
    }));
    node.children = [...node.children, ...leafEntries];
  }

  return [root];
}

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  currentPath: string;
  onNavigate: (path: string) => void;
}

function TreeNodeRow({ node, depth, currentPath, onNavigate }: TreeNodeRowProps) {
  const [open, setOpen] = useState(node.isExpanded);
  const isActive   = node.path === currentPath;
  const isDir      = node.type === 'DIRECTORY' || node.type === 'root';
  const isFile     = node.type === 'FILE';
  const hasChildren = node.children.length > 0;

  const fileIconName  = isFile ? getFileIcon(node.name) : 'folder';
  const fileIconColor = isFile
    ? getFileIconColor(node.name, 'FILE')
    : isActive
    ? 'text-[#26A69A]'
    : 'text-[#26A69A]/60 group-hover:text-[#26A69A]';

  return (
    <div>
      <div
        onClick={() => {
          if (isDir) {
            setOpen(v => !v);
            onNavigate(node.path);
          }
        }}
        className={`flex items-center gap-1.5 w-full text-left py-[3px] pr-2 rounded transition-colors group ${
          isDir
            ? 'cursor-pointer'
            : 'cursor-default'
        } ${
          isActive && isDir
            ? 'bg-[#1E2A3A] text-primary'
            : isFile
            ? 'text-secondary hover:text-primary hover:bg-white/[0.025]'
            : 'text-muted hover:text-secondary hover:bg-white/[0.03]'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {/* Expand chevron — only for dirs */}
        <span
          className={`material-symbols-rounded shrink-0 transition-transform duration-150 ${
            open ? 'rotate-90' : ''
          } ${isDir && hasChildren ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{ fontSize: '13px' }}
        >
          chevron_right
        </span>

        {/* Icon */}
        <span
          className={`material-symbols-rounded shrink-0 transition-colors ${fileIconColor}`}
          style={{
            fontSize: isFile ? '13px' : '15px',
            fontVariationSettings: !isFile && open ? "'FILL' 1" : undefined,
          }}
        >
          {fileIconName}
        </span>

        {/* Label */}
        <span className="text-meta truncate flex-1">
          {node.name === 'root' ? '/' : node.name}
        </span>
      </div>

      {/* Children — only directories expand */}
      {isDir && open && node.children.length > 0 && (
        <div>
          {node.children.map(child => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              currentPath={currentPath}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DirectoryTree({
  pathStack,
  entries,
  currentPath,
  onNavigate,
  width,
  onResizeMouseDown,
  onHide,
}: DirectoryTreeProps) {
  const tree = buildTreeFromStack(pathStack, entries, currentPath);

  return (
    <div
      className="flex flex-col border-r border-[#1E1E2E] overflow-hidden shrink-0 relative"
      style={{ background: '#0D111E', width }}
    >
      {/* Panel header */}
      <div className="px-3 pt-2.5 pb-2 flex items-center justify-between border-b border-[#1E1E2E] shrink-0">
        <span className="text-micro text-muted">
          Workspace Explorer
        </span>
        {onHide && (
          <button
            onClick={onHide}
            className="p-0.5 hover:bg-white/5 rounded cursor-pointer transition-colors"
            title="Hide explorer"
          >
            <span
              className="material-symbols-rounded text-[#4A5275] hover:text-slate-300 transition-colors"
              style={{ fontSize: '14px' }}
            >
              close
            </span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
        {tree.map(node => (
          <TreeNodeRow
            key={node.path}
            node={node}
            depth={0}
            currentPath={currentPath}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {/* Right-edge drag handle */}
      <div
        onMouseDown={onResizeMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 group"
        title="Drag to resize"
      >
        <div className="w-full h-full bg-transparent group-hover:bg-[#7C6DFA]/40 transition-colors" />
      </div>
    </div>
  );
}
