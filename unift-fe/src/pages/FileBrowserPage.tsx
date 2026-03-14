/**
 * FileBrowserPage
 * Full-screen file manager: sidebar tree + table listing + mini transfer widget.
 * Matches main_file_browser_refined_industrial/code.html design.
 */

import { useState, useMemo } from 'react';
import { Layout } from '@/components/layout';
import { Header, HeaderSearch, HeaderAvatar } from '@/components/layout';
import { Sidebar, StorageBar } from '@/components/layout';
import { getFileIcon, formatFileSize, cn } from '@/utils/helpers';
import type { FileItem } from '@/types';
import type { SidebarItem } from '@/components/layout';

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_FILES: FileItem[] = [
  { id: '1', name: 'system_architecture_final_v2.pdf', type: 'file', size: 4404019,  mimeType: 'application/pdf',   createdAt: '', updatedAt: '2023-11-15 09:12', owner: 'admin', path: '/root/Industrial_Design/Assets_V2' },
  { id: '2', name: 'hero_render_01.png',               type: 'file', size: 13107200, mimeType: 'image/png',          createdAt: '', updatedAt: '2023-11-14 18:45', owner: 'admin', path: '/root/Industrial_Design/Assets_V2' },
  { id: '3', name: 'budget_breakdown_24.xlsx',         type: 'file', size: 245760,   mimeType: 'application/vnd.ms-excel', createdAt: '', updatedAt: '2023-11-12 14:20', owner: 'admin', path: '/root/Industrial_Design/Assets_V2' },
  { id: '4', name: 'Legacy_Components',                type: 'folder', size: 0,      mimeType: 'folder',             createdAt: '', updatedAt: '2023-11-10 11:05', owner: 'admin', path: '/root/Industrial_Design' },
  { id: '5', name: 'meeting_notes_nov.txt',            type: 'file', size: 12288,    mimeType: 'text/plain',         createdAt: '', updatedAt: '2023-11-09 10:00', owner: 'admin', path: '/root/Industrial_Design/Assets_V2' },
  { id: '6', name: 'main.controller.ts',               type: 'file', size: 5120,     mimeType: 'text/typescript',    createdAt: '', updatedAt: '2023-11-08 16:55', owner: 'admin', path: '/root/Industrial_Design/Assets_V2' },
  { id: '7', name: 'API_documentation.pdf',            type: 'file', size: 1887437,  mimeType: 'application/pdf',    createdAt: '', updatedAt: '2023-11-07 14:30', owner: 'admin', path: '/root/Industrial_Design/Assets_V2' },
  { id: '8', name: 'assembly_guide.mp4',               type: 'file', size: 92274688, mimeType: 'video/mp4',          createdAt: '', updatedAt: '2023-11-05 09:15', owner: 'admin', path: '/root/Industrial_Design/Assets_V2' },
  { id: '9', name: 'project_specs.pdf',                type: 'file', size: 2202009,  mimeType: 'application/pdf',    createdAt: '', updatedAt: '2023-11-04 11:20', owner: 'admin', path: '/root/Industrial_Design/Assets_V2' },
];

const NAV_ITEMS: SidebarItem[] = [
  { id: 'docs',       label: 'Documents',  icon: 'description',   active: true },
  { id: 'renders',    label: 'Renders',    icon: 'image' },
  { id: 'recordings', label: 'Recordings', icon: 'video_library' },
  { id: 'trash',      label: 'Trash',      icon: 'delete' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileExtension(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop()!.toUpperCase() : '—';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FileBrowserPage() {
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [activeNav, setActiveNav]     = useState('docs');
  const [showTransfer, setShowTransfer] = useState(true);

  const filtered = useMemo(() =>
    MOCK_FILES.filter((f) =>
      f.name.toLowerCase().includes(search.toLowerCase()),
    ), [search]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(
      selected.size === filtered.length ? new Set() : new Set(filtered.map((f) => f.id)),
    );

  const navItems: SidebarItem[] = NAV_ITEMS.map((i) => ({ ...i, active: i.id === activeNav }));

  return (
    <Layout>
      {/* ── Top bar ── */}
      <Header
        breadcrumb={[
          { label: 'Root', href: '#' },
          { label: 'Industrial_Design', href: '#' },
          { label: 'Assets_V2' },
        ]}
        rightContent={
          <div className="flex items-center gap-3">
            <HeaderSearch
              value={search}
              onChange={setSearch}
              placeholder="Search files…"
            />
            <button className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-text-warm transition-colors">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>settings</span>
            </button>
            <HeaderAvatar nodeLabel="NODE_ALPHA" />
          </div>
        }
      />

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <Sidebar
          items={navItems}
          onItemClick={(item) => setActiveNav(item.id)}
          footer={<StorageBar usedPercent={85} />}
        />

        {/* Main panel */}
        <main className="flex-1 flex flex-col overflow-hidden relative">

          {/* ── Column headers ── */}
          <div className="bg-surface/50 border-b border-border-subtle flex items-center px-4 shrink-0">
            {/* Checkbox */}
            <div className="w-8 py-2 flex items-center">
              <input
                type="checkbox"
                checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleAll}
                className="permission-checkbox"
                aria-label="Select all"
              />
            </div>
            <div className="flex-1 label py-2 border-r border-border-subtle pl-2">Name</div>
            <div className="w-20 label py-2 border-r border-border-subtle px-3">Ext</div>
            <div className="w-28 label py-2 border-r border-border-subtle px-3 text-right">Size</div>
            <div className="w-44 label py-2 px-3">Mod Date</div>
            <div className="w-10 label py-2 text-center">···</div>
          </div>

          {/* ── File rows ── */}
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-bg-base/30">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                <span className="material-symbols-outlined" style={{ fontSize: 40 }}>folder_open</span>
                <span className="text-[13px]">No files found</span>
              </div>
            ) : (
              filtered.map((file) => {
                const isSelected = selected.has(file.id);
                const isFolder   = file.type === 'folder';
                const icon       = isFolder ? 'folder' : getFileIcon(file.mimeType);
                return (
                  <div
                    key={file.id}
                    onClick={() => toggleSelect(file.id)}
                    className={cn(
                      'flex items-center px-4 h-8 border-b border-border-subtle/30 cursor-pointer transition-all group',
                      isSelected
                        ? 'bg-primary/10 border-l-[3px] border-l-primary'
                        : 'border-l-[3px] border-l-transparent hover:bg-surface-hover',
                    )}
                  >
                    {/* Checkbox */}
                    <div className="w-8 flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(file.id)}
                        className="permission-checkbox"
                      />
                    </div>

                    {/* Name */}
                    <div className="flex-1 flex items-center gap-2 min-w-0 pl-2">
                      <span
                        className={cn(
                          'material-symbols-outlined shrink-0',
                          isSelected ? 'text-primary' : 'text-slate-500',
                        )}
                        style={{ fontSize: 16 }}
                      >
                        {icon}
                      </span>
                      <span
                        className={cn(
                          'truncate text-[13px]',
                          isSelected ? 'text-text-warm' : 'text-slate-300 group-hover:text-text-warm',
                        )}
                      >
                        {file.name}
                      </span>
                    </div>

                    {/* Ext */}
                    <div className="w-20 px-3 font-mono text-[12px] text-slate-500 shrink-0">
                      {isFolder ? 'DIR' : fileExtension(file.name)}
                    </div>

                    {/* Size */}
                    <div className="w-28 px-3 font-mono text-[12px] text-slate-500 text-right shrink-0">
                      {isFolder ? '—' : formatFileSize(file.size)}
                    </div>

                    {/* Date */}
                    <div className="w-44 px-3 font-mono text-[12px] text-slate-500 shrink-0">
                      {file.updatedAt}
                    </div>

                    {/* Actions */}
                    <div className="w-10 flex items-center justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-all p-1">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>more_vert</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Mini Transfer widget ── */}
          {showTransfer && (
            <div className="absolute bottom-4 right-4 w-72 bg-surface border border-border-subtle panel-depth p-4 flex flex-col gap-3 z-20">
              <div className="flex items-center justify-between">
                <span className="label text-slate-400">Active Transfer</span>
                <button
                  onClick={() => setShowTransfer(false)}
                  className="text-slate-500 hover:text-text-warm transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between font-mono text-[12px]">
                  <span className="text-text-warm truncate w-40">upload_render_final_4k.zip</span>
                  <span className="text-primary font-bold shrink-0">65%</span>
                </div>
                <div className="prog-track w-full">
                  <div className="prog-fill" style={{ width: '65%' }} />
                </div>
                <div className="flex justify-between label text-slate-500">
                  <span>1.4 GB / 2.1 GB</span>
                  <span>2m 14s left</span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Status bar ── */}
      <footer className="h-7 bg-surface border-t border-border-subtle flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-4 label text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-status-ok shrink-0" />
            Connected
          </span>
          <span>{filtered.length} items</span>
          {selected.size > 0 && (
            <span className="text-text-warm">{selected.size} selected</span>
          )}
        </div>
        <div className="flex items-center gap-3 label text-slate-500">
          <span className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>cloud_upload</span>
            Sync Active
          </span>
          <span>UTF-8</span>
        </div>
      </footer>
    </Layout>
  );
}

