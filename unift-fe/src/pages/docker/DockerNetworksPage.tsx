/**
 * Docker Networks — Lists all Docker networks on the remote host
 * with driver, scope, connected containers, and CRUD actions.
 *
 * Data source: DockerController.listNetworks / createNetwork / removeNetwork
 * via remoteConnectionAPI
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { DockerNetwork } from '@/utils/remoteConnectionAPI';

interface DockerNetworksPageProps {
  sessionId: string;
}

const DRIVER_OPTIONS = ['bridge', 'overlay', 'macvlan', 'host', 'none'] as const;

export function DockerNetworksPage({ sessionId }: DockerNetworksPageProps) {
  const [networks, setNetworks] = useState<DockerNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchNetworks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await remoteConnectionAPI.listDockerNetworks(sessionId);
      setNetworks(res);
    } catch {
      // Networks stay empty on failure
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchNetworks();
  }, [fetchNetworks]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return networks;
    const q = searchQuery.toLowerCase();
    return networks.filter(n =>
      n.name.toLowerCase().includes(q) ||
      n.driver.toLowerCase().includes(q) ||
      n.scope.toLowerCase().includes(q),
    );
  }, [networks, searchQuery]);

  const handleRemove = useCallback(async (networkId: string) => {
    setRemovingId(networkId);
    try {
      await remoteConnectionAPI.removeDockerNetwork(sessionId, networkId);
      await fetchNetworks();
    } catch {
      // Remove failed
    } finally {
      setRemovingId(null);
    }
  }, [sessionId, fetchNetworks]);

  const handleCreate = useCallback(async (name: string, driver: string) => {
    try {
      await remoteConnectionAPI.createDockerNetwork(sessionId, name, driver);
      setShowCreate(false);
      await fetchNetworks();
    } catch {
      // Create failed
    }
  }, [sessionId, fetchNetworks]);

  const containerCount = (n: DockerNetwork) => Object.keys(n.containers ?? {}).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-4">
        <div>
          <p
            className="uppercase tracking-[0.15em] font-semibold"
            style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
          >
            Networking
          </p>
          <h1
            className="mt-1 font-bold"
            style={{ fontSize: '24px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            Docker Networks
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
          Create Network
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
          <input
            type="text"
            placeholder="Search networks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-md"
            style={{
              fontSize: '12px',
              background: 'var(--color-bg-base)',
              color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border-muted)',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
            }}
          />
        </div>
        <button
          onClick={fetchNetworks}
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
                {['Network Name', 'Driver', 'Scope', 'Internal', 'Containers', 'Subnet', 'Actions'].map(h => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 font-semibold uppercase tracking-[0.1em]"
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
                  <td colSpan={7} className="text-center py-12">
                    <LoadingSpinner text="Loading networks..." />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <EmptyState
                      icon="hub"
                      text={searchQuery ? 'No networks match your search' : 'No networks found'}
                    />
                  </td>
                </tr>
              ) : filtered.map(n => (
                <tr
                  key={n.id}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid var(--color-border-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,109,250,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="material-symbols-rounded flex-shrink-0"
                        style={{ fontSize: '16px', color: 'var(--color-primary)', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                      >
                        hub
                      </span>
                      <span className="font-semibold" style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                        {n.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <DriverBadge driver={n.driver} />
                  </td>
                  <td className="px-4 py-3.5">
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{n.scope}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span style={{ fontSize: '12px', color: n.internal ? '#facc15' : 'var(--color-text-muted)' }}>
                      {n.internal ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono" style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      {containerCount(n)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {n.ipam?.subnet ?? '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => handleRemove(n.id)}
                      disabled={removingId === n.id}
                      title="Remove Network"
                      className="w-7 h-7 rounded flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40"
                      style={{ color: '#f87171', background: 'transparent', border: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.1)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {removingId === n.id ? (
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
              className="uppercase tracking-[0.1em] font-semibold"
              style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
            >
              Showing {filtered.length} of {networks.length} networks
            </p>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateNetworkModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

function DriverBadge({ driver }: { driver: string }) {
  const color = driver === 'bridge' ? '#7C6DFA'
    : driver === 'overlay' ? '#66d9cc'
    : driver === 'host' ? '#facc15'
    : 'var(--color-text-muted)';

  return (
    <span
      className="font-mono px-2 py-0.5 rounded"
      style={{ fontSize: '11px', color, background: `${color}15`, border: `1px solid ${color}30` }}
    >
      {driver}
    </span>
  );
}

function CreateNetworkModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, driver: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [driver, setDriver] = useState('bridge');
  const [creating, setCreating] = useState(false);

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
            Create Network
          </span>
          <button onClick={onClose} className="p-1 rounded cursor-pointer" style={{ color: 'var(--color-text-muted)' }}>
            <span className="material-symbols-rounded" style={{ fontSize: '16px' }}>close</span>
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <ModalField label="Network Name">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="my-network"
              className="w-full px-3 py-2 rounded-md"
              style={{
                fontSize: '12px', background: 'var(--color-surface)',
                color: 'var(--color-text-primary)', border: '1px solid var(--color-border-muted)', outline: 'none',
              }}
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
              {DRIVER_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
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
        className="block mb-1.5 font-semibold uppercase tracking-[0.1em]"
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
