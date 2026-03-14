import { useState } from 'react';

/* ─── Local Types ─────────────────────────────────────────── */
interface FolderNode {
  name: string;
  path: string;
  icon: string;
  locked?: boolean;
  children?: FolderNode[];
}

interface PermissionRow {
  id: string;
  path: string;
  icon: string;
  inheritance: string;
  r: boolean;
  w: boolean;
  x: boolean;
  role: string;
  modified: string;
  locked?: boolean;
}

/* ─── Static Data ─────────────────────────────────────────── */
const FOLDER_TREE: FolderNode[] = [
  {
    name: 'root',
    path: '/root',
    icon: 'folder_open',
    children: [
      {
        name: 'assets',
        path: '/root/assets',
        icon: 'folder_shared',
        children: [
          { name: 'fmpr', path: '/root/assets/fmpr', icon: 'lock', locked: true },
          { name: 'raw_data', path: '/root/assets/raw_data', icon: 'folder' },
        ],
      },
      { name: 'projects', path: '/root/projects', icon: 'folder' },
      { name: 'shared', path: '/root/shared', icon: 'folder' },
    ],
  },
];

const INITIAL_PERMISSIONS: PermissionRow[] = [
  {
    id: '1',
    path: '/root/assets/fmpr',
    icon: 'lock',
    inheritance: 'System Level',
    r: true, w: true, x: true,
    role: 'System',
    modified: '2023-10-24 09:15',
    locked: true,
  },
  {
    id: '2',
    path: '/root/projects/design',
    icon: 'folder_open',
    inheritance: 'Explicit',
    r: true, w: true, x: false,
    role: 'Admin',
    modified: '2023-11-01 14:20',
  },
  {
    id: '3',
    path: '/root/shared/docs',
    icon: 'folder',
    inheritance: 'Recursive',
    r: true, w: false, x: false,
    role: 'All Users',
    modified: '2023-11-02 11:45',
  },
];

/* ─── Sub-components ──────────────────────────────────────── */
function RoleBadge({ role }: { role: string }) {
  const isSystem = role === 'System';
  return (
    <span
      className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase border tracking-widest
        ${isSystem
          ? 'bg-[#161814] text-slate-500 border-slate-700'
          : 'bg-[#232620] text-slate-300 border-[#3a3a34]'
        }`}
    >
      {role}
    </span>
  );
}

interface TreeNodeProps {
  node: FolderNode;
  depth?: number;
  selectedPath: string;
  onSelect: (path: string) => void;
}

function TreeNode({ node, depth = 0, selectedPath, onSelect }: TreeNodeProps) {
  const isSelected = selectedPath === node.path;
  const isLocked = node.locked;

  return (
    <div>
      <div
        onClick={() => !isLocked && onSelect(node.path)}
        className={`flex items-center gap-2 p-2 text-sm transition-colors
          ${isLocked
            ? 'text-slate-600 bg-[#161814] italic cursor-not-allowed'
            : isSelected
              ? 'text-slate-200 bg-white/5 border border-white/10 cursor-pointer'
              : 'text-slate-400 hover:bg-white/5 cursor-pointer'
          }`}
        style={{ paddingLeft: `${0.5 + depth * 1.5}rem` }}
      >
        <span className={`material-symbols-outlined text-lg ${isLocked ? 'opacity-30' : 'text-slate-400'}`}>
          {node.icon}
        </span>
        <span className={isLocked ? '' : isSelected ? 'font-medium' : ''}>{node.name}</span>
      </div>
      {node.children && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Nav items ────────────────────────────────────────────── */
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'permissions', label: 'Permissions', icon: 'folder_managed', active: true },
  { id: 'users', label: 'User Management', icon: 'group' },
  { id: 'logs', label: 'Audit Logs', icon: 'history_edu' },
];

/* ─── Page ─────────────────────────────────────────────────── */
export function AdminPermissionsPage() {
  const [selectedPath, setSelectedPath] = useState('/root/assets');
  const [permissions, setPermissions] = useState<PermissionRow[]>(INITIAL_PERMISSIONS);
  const [newPath, setNewPath] = useState('');
  const [newInheritance, setNewInheritance] = useState('Inherit');
  const [newR, setNewR] = useState(false);
  const [newW, setNewW] = useState(false);
  const [newX, setNewX] = useState(false);

  function togglePerm(id: string, field: 'r' | 'w' | 'x') {
    setPermissions(prev =>
      prev.map(row => (row.id === id && !row.locked ? { ...row, [field]: !row[field] } : row))
    );
  }

  function handleAddFolder() {
    if (!newPath.trim()) return;
    const next: PermissionRow = {
      id: String(Date.now()),
      path: newPath.trim(),
      icon: 'folder',
      inheritance: newInheritance,
      r: newR, w: newW, x: newX,
      role: 'Admin',
      modified: new Date().toISOString().slice(0, 16).replace('T', ' '),
    };
    setPermissions(prev => [...prev, next]);
    setNewPath('');
    setNewR(false);
    setNewW(false);
    setNewX(false);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#1C1E1A] text-slate-100">

      {/* ── Top Nav ────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-[#3a3a34] bg-[#232620] px-6 py-3 shrink-0">
        <div className="flex items-center gap-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl text-slate-400">factory</span>
            <h2 className="text-lg font-bold tracking-tighter uppercase font-mono">
              UniFT <span className="text-slate-500 font-light">Admin</span>
            </h2>
          </div>
          {/* Search */}
          <div className="relative w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
            <input
              type="text"
              placeholder="SEARCH DIRECTORIES..."
              className="w-full bg-[#161814] border border-[#3a3a34] rounded pl-10 pr-4 py-1.5
                text-[11px] font-mono font-medium text-slate-300 uppercase placeholder:text-slate-600
                focus:ring-1 focus:ring-slate-500 focus:border-slate-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Notifications */}
          <button className="p-2 hover:bg-white/5 rounded transition-colors relative">
            <span className="material-symbols-outlined text-slate-400">notifications</span>
            <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-[#E07B39] rounded-full" />
          </button>
          {/* Settings */}
          <button className="p-2 hover:bg-white/5 rounded transition-colors">
            <span className="material-symbols-outlined text-slate-400">settings</span>
          </button>

          <div className="h-8 w-px bg-[#3a3a34] mx-2" />

          {/* User chip */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-200 leading-none font-mono">A. VANCE</p>
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest mt-1">Systems Lead</p>
            </div>
            <div className="w-10 h-10 rounded bg-[#161814] flex items-center justify-center border border-[#3a3a34]">
              <span className="material-symbols-outlined text-slate-500">person</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────── */}
      <main className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ──────────────────────────────────────── */}
        <aside className="w-64 border-r border-[#3a3a34] flex flex-col shrink-0 bg-[#232620]">
          <div className="p-4 space-y-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 px-3 mb-4">Navigation</p>
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all text-left
                  ${item.active
                    ? 'bg-white/5 text-slate-100 border-l-[3px] border-[#E07B39]'
                    : 'rounded text-slate-400 hover:text-slate-100 hover:bg-white/5'
                  }`}
              >
                <span className="material-symbols-outlined text-xl">{item.icon}</span>
                <span className={item.active ? 'font-semibold' : ''}>{item.label}</span>
              </button>
            ))}
          </div>

          {/* System Status card */}
          <div className="mt-auto p-4 border-t border-[#3a3a34]">
            <div className="bg-[#161814] rounded p-3 border border-[#3a3a34]">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-slate-500 text-sm">security</span>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">System Status</p>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                All protocols active. Integrity check passed.
              </p>
            </div>
          </div>
        </aside>

        {/* ── Permission Section ────────────────────────────── */}
        <section className="flex-1 flex overflow-hidden">

          {/* Folder Tree Pane */}
          <div className="w-80 border-r border-[#3a3a34] bg-[#161814]/30 custom-scrollbar overflow-y-auto shrink-0">
            <div className="p-4 border-b border-[#3a3a34] sticky top-0 bg-[#232620]/95 backdrop-blur-sm z-10 flex justify-between items-center">
              <h3 className="label">Directory Tree</h3>
              <button className="text-slate-500 hover:text-slate-300 transition-colors">
                <span className="material-symbols-outlined text-lg">create_new_folder</span>
              </button>
            </div>
            <div className="p-2 space-y-0.5 text-sm">
              {FOLDER_TREE.map(node => (
                <TreeNode
                  key={node.path}
                  node={node}
                  selectedPath={selectedPath}
                  onSelect={setSelectedPath}
                />
              ))}
            </div>
          </div>

          {/* Permission Matrix Pane */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#1C1E1A]/30">

            {/* Pane header */}
            <div className="p-6 border-b border-[#3a3a34] shrink-0">
              <div className="flex justify-between items-end">
                <div>
                  <p className="label mb-2">Directory Explorer</p>
                  <h1 className="text-2xl font-bold tracking-tight uppercase text-slate-100 mb-2">
                    Folder Permissions
                  </h1>
                  <p className="text-sm text-slate-500">
                    Configure recursive access levels for system directories.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button className="flex items-center gap-2 px-5 py-2.5 border border-[#3a3a34] rounded
                    text-[10px] font-bold uppercase tracking-wider text-slate-300
                    hover:bg-white/5 transition-colors font-mono">
                    <span className="material-symbols-outlined text-lg">download</span>
                    Export Report
                  </button>
                  <button className="flex items-center gap-2 px-6 py-2.5 bg-[#E07B39] rounded
                    text-[10px] font-bold uppercase tracking-widest text-white
                    shadow-lg shadow-[#E07B39]/10 hover:brightness-110 transition-all font-mono">
                    <span className="material-symbols-outlined text-lg">save</span>
                    Commit Changes
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#232620]/95 backdrop-blur-sm z-10">
                  <tr className="border-b border-[#3a3a34]">
                    {['Directory Path', 'Inheritance', 'R', 'W', 'X', 'Role Badge', 'Last Modified', 'Actions'].map((col, i) => (
                      <th
                        key={col}
                        className={`px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-500
                          ${i >= 2 && i <= 4 ? 'text-center' : i === 7 ? 'text-right' : ''}`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#3a3a34]/30 text-sm">
                  {permissions.map(row => (
                    <tr
                      key={row.id}
                      className={`transition-colors ${
                        row.locked
                          ? 'bg-[#161814]/40'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {/* Path */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-lg ${row.locked ? 'text-slate-600' : 'text-slate-500'}`}>
                            {row.icon}
                          </span>
                          <span className={`font-mono text-xs ${row.locked ? 'text-slate-500' : 'text-slate-300'}`}>
                            {row.path}
                          </span>
                        </div>
                      </td>

                      {/* Inheritance */}
                      <td className="px-6 py-5">
                        <span className="text-[10px] font-medium uppercase text-slate-500 tracking-wide">
                          {row.inheritance}
                        </span>
                      </td>

                      {/* R / W / X */}
                      {(['r', 'w', 'x'] as const).map(perm => (
                        <td key={perm} className="px-6 py-5 text-center">
                          <input
                            type="checkbox"
                            checked={row[perm]}
                            disabled={row.locked}
                            onChange={() => togglePerm(row.id, perm)}
                            className="permission-checkbox"
                          />
                        </td>
                      ))}

                      {/* Role */}
                      <td className="px-6 py-5">
                        <RoleBadge role={row.role} />
                      </td>

                      {/* Modified */}
                      <td className="px-6 py-5 text-[11px] text-slate-500 font-mono">
                        {row.locked ? (
                          <span className="opacity-50">{row.modified}</span>
                        ) : (
                          row.modified
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-5 text-right">
                        {row.locked ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700">
                            Immutable
                          </span>
                        ) : (
                          <button className="text-slate-600 hover:text-slate-300 transition-colors">
                            <span className="material-symbols-outlined text-lg">more_vert</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Add-row footer */}
                <tfoot className="sticky bottom-0 bg-[#232620]/95 backdrop-blur-sm z-10 border-t border-[#3a3a34]">
                  <tr className="bg-white/5">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-slate-500 text-lg">add_circle</span>
                        <input
                          type="text"
                          value={newPath}
                          onChange={e => setNewPath(e.target.value)}
                          placeholder="/root/new/directory..."
                          className="bg-transparent border-none p-0 text-xs font-mono placeholder:text-slate-700
                            focus:ring-0 w-full outline-none uppercase text-slate-300"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={newInheritance}
                        onChange={e => setNewInheritance(e.target.value)}
                        className="bg-transparent border-none p-0 text-[10px] text-slate-500
                          focus:ring-0 outline-none uppercase font-bold tracking-widest"
                      >
                        <option>Inherit</option>
                        <option>Explicit</option>
                        <option>Recursive</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input type="checkbox" checked={newR} onChange={e => setNewR(e.target.checked)} className="permission-checkbox" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input type="checkbox" checked={newW} onChange={e => setNewW(e.target.checked)} className="permission-checkbox" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input type="checkbox" checked={newX} onChange={e => setNewX(e.target.checked)} className="permission-checkbox" />
                    </td>
                    <td className="px-6 py-4">
                      <button className="text-[9px] font-bold uppercase text-slate-500 border border-[#3a3a34]
                        px-2 py-1 rounded hover:border-slate-400 transition-colors tracking-widest font-mono">
                        Select Role
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[11px] italic text-slate-600">Auto-generated</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={handleAddFolder}
                        className="text-slate-300 hover:text-white font-bold text-[10px] uppercase tracking-widest
                          border border-slate-600 px-3 py-1 rounded transition-colors font-mono"
                      >
                        Add Folder
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Footer legend */}
            <div className="p-4 bg-[#161814] border-t border-[#3a3a34] flex justify-between items-center shrink-0">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-[#E07B39] rounded-[1px]" />
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Explicit Access</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-[#161814] border border-[#3a3a34] rounded-[1px]" />
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">System Inherited</span>
                </div>
              </div>
              <div className="text-[9px] text-slate-600 font-mono tracking-tighter uppercase">
                Node: UNIFT-IND-CTRL-04 // 192.168.1.104
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
