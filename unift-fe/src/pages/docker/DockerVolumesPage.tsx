/**
 * Docker Volumes — Lists all Docker volumes on the remote host
 * with driver, mountpoint, scope, and CRUD actions.
 *
 * Data source: DockerController.listVolumes / createVolume / removeVolume
 * via remoteConnectionAPI
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { Input } from '@/components/ui/input';
import type { DockerVolume } from '@/utils/remoteConnectionAPI';

interface DockerVolumesPageProps {
  sessionId: string;
}

export function DockerVolumesPage({ sessionId }: DockerVolumesPageProps) {
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [removingName, setRemovingName] = useState<string | null>(null);

  const fetchVolumes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await remoteConnectionAPI.listDockerVolumes(sessionId);
      setVolumes(res);
    } catch {
      // Volumes stay empty on failure
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchVolumes();
  }, [fetchVolumes]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return volumes;
    const q = searchQuery.toLowerCase();
    return volumes.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.driver.toLowerCase().includes(q) ||
      v.mountpoint.toLowerCase().includes(q),
    );
  }, [volumes, searchQuery]);

  const handleRemove = useCallback(async (volumeName: string) => {
    setRemovingName(volumeName);
    try {
      await remoteConnectionAPI.removeDockerVolume(sessionId, volumeName);
      await fetchVolumes();
    } catch {
      // Remove failed
    } finally {
      setRemovingName(null);
    }
  }, [sessionId, fetchVolumes]);

  const handleCreate = useCallback(async (name: string, driver: string) => {
    try {
      await remoteConnectionAPI.createDockerVolume(sessionId, name, driver);
      setShowCreate(false);
      await fetchVolumes();
    } catch {
      // Create failed
    }
  }, [sessionId, fetchVolumes]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-4">
        <div>
          <p
            className="uppercase tracking-[0.15em] font-semibold"
            style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
          >
            Storage
          </p>
          <h1
            className="mt-1 font-bold"
            style={{ fontSize: '24px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            Docker Volumes
          </h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-md font-semibold cursor-pointer flex items-center gap-1.5"
          style={{ fontSize: '12px', background: 'var(--color-primary)', color: '#fff' }}
        >
          <span
            className="material-symbols-rounded"
            style={{ fontSize: '16px', fontVariationSettings: "'FILL' 0, 'wght' 400" }}
          >
            add
          </span>
          Create Volume
        </button>
      </div>

      {/* Search + Refresh */}
      <div className="flex items-center gap-3 px-6 pb-4">
        <div className="relative flex-1">
          <span
            className="material-symbols-rounded absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ fontSize: '16px', color: 'var(--color-text-muted)', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
          >
            search
          </span>
          <Input
            type="text"
            placeholder="Search volumes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8"
          />
        </div>
        <button
          onClick={fetchVolumes}
          className="p-2 rounded-md cursor-pointer transition-colors"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-muted)' }}
          title="Refresh"
        >
          <span
            className="material-symbols-rounded"
            style={{ fontSize: '18px', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
          >
            refresh
          </span>
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6">
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--color-border-muted)' }}
        >
          <table className="w-full border-collapse" style={{ fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface)' }}>
                {['Volume Name', 'Driver', 'Mountpoint', 'Scope', 'Actions'].map(h => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 font-semibold uppercase tracking-widest"
                    style={{ fontSize: '10px', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border-muted)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <LoadingSpinner text="Loading volumes..." />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <EmptyState
                      icon="hard_drive"
                      text={searchQuery ? 'No volumes match your search' : 'No volumes found'}
                    />
                  </td>
                </tr>
              ) : filtered.map(v => (
                <tr
                  key={v.name}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid var(--color-border-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,109,250,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="material-symbols-rounded shrink-0"
                        style={{ fontSize: '16px', color: 'var(--color-primary)', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                      >
                        hard_drive
                      </span>
                      <span className="font-semibold" style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                        {v.name.length > 40 ? `${v.name.substring(0, 12)}...` : v.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className="font-mono px-2 py-0.5 rounded"
                      style={{
                        fontSize: '11px', color: 'var(--color-primary)',
                        background: 'rgba(124,109,250,0.08)', border: '1px solid rgba(124,109,250,0.2)',
                      }}
                    >
                      {v.driver}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className="font-mono truncate block max-w-[300px]"
                      style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}
                      title={v.mountpoint}
                    >
                      {v.mountpoint}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{v.scope}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => handleRemove(v.name)}
                      disabled={removingName === v.name}
                      title="Remove Volume"
                      className="w-7 h-7 rounded flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40"
                      style={{ color: '#f87171', background: 'transparent', border: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.1)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {removingName === v.name ? (
                        <div
                          className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                          style={{ borderColor: 'var(--color-border-muted)', borderTopColor: '#f87171' }}
                        />
                      ) : (
                        <span
                          className="material-symbols-rounded"
                          style={{ fontSize: '16px', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                        >
                          delete
                        </span>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="mt-3 pb-4">
            <p
              className="uppercase tracking-widest font-semibold"
              style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
            >
              Showing {filtered.length} of {volumes.length} volumes
            </p>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateVolumeModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
    </div>
  );
}

function CreateVolumeModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, driver: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [driver, setDriver] = useState('local');
  const [creating, setCreating] = useState(false);

  useEscapeKey(onClose);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await onCreate(name.trim(), driver);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="fixed z-50 rounded-lg overflow-hidden flex flex-col"
        style={{
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '420px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-muted)',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--color-border-muted)' }}>
          <span className="font-semibold" style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
            Create Volume
          </span>
          <button onClick={onClose} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>close</span>
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <ModalField label="Volume Name">
            <Input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="my-volume"
              className="w-full"
            />
          </ModalField>
          <ModalField label="Driver">
            <select
              value={driver}
              onChange={e => setDriver(e.target.value)}
              className="w-full px-3 py-2 rounded-md cursor-pointer"
              style={{
                fontSize: '12px', background: 'var(--color-surface)',
                color: 'var(--color-text-primary)', border: '1px solid var(--color-border-muted)', outline: 'none',
              }}
            >
              <option value="local">local</option>
              <option value="nfs">nfs</option>
              <option value="tmpfs">tmpfs</option>
            </select>
          </ModalField>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--color-border-muted)' }}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md cursor-pointer font-semibold"
            style={{ fontSize: '12px', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || creating}
            className="px-4 py-1.5 rounded-md cursor-pointer font-semibold disabled:opacity-40"
            style={{ fontSize: '12px', background: 'var(--color-primary)', color: '#fff' }}
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block mb-1.5 font-semibold uppercase tracking-widest"
        style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function LoadingSpinner({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-5 h-5 border-2 rounded-full animate-spin"
        style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
      />
      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{text}</span>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className="material-symbols-rounded"
        style={{ fontSize: '32px', color: 'var(--color-text-muted)', fontVariationSettings: "'FILL' 0, 'wght' 200" }}
      >
        {icon}
      </span>
      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{text}</span>
    </div>
  );
}
