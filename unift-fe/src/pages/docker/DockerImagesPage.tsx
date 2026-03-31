/**
 * Docker Images Manager — Lists all Docker images on the remote host
 * with repository, tag, size, creation date, and action controls.
 *
 * Design reference: designs/unift/docker_images_manager/screen.png
 *
 * Data source: DockerController.listImages
 * via remoteConnectionAPI.listDockerImages
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type {
  DockerImage,
  ImagePage,
  ContainerActionResult,
} from '@/utils/remoteConnectionAPI';

interface DockerImagesPageProps {
  sessionId: string;
}

export function DockerImagesPage({ sessionId }: DockerImagesPageProps) {
  const [images, setImages] = useState<DockerImage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchImages = useCallback(async () => {
    try {
      setLoading(true);
      const res: ImagePage = await remoteConnectionAPI.listDockerImages(sessionId);
      setImages(res.images);
      setTotal(res.total);
    } catch {
      // Images stay empty on failure
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const filteredImages = useMemo(() => {
    if (!searchQuery.trim()) return images;
    const q = searchQuery.toLowerCase();
    return images.filter(img =>
      img.repository.toLowerCase().includes(q) ||
      img.tag.toLowerCase().includes(q) ||
      img.id.toLowerCase().includes(q)
    );
  }, [images, searchQuery]);

  const totalSize = useMemo(() => {
    let bytes = 0;
    for (const img of images) {
      bytes += parseSizeToBytes(img.size);
    }
    return formatBytes(bytes);
  }, [images]);

  const unusedCount = useMemo(() => {
    return images.filter(i => i.repository === '<none>' || i.tag === '<none>').length;
  }, [images]);

  const handleRemoveImage = useCallback(async (imageId: string) => {
    setRemovingId(imageId);
    try {
      const result: ContainerActionResult = await remoteConnectionAPI.removeDockerImage(sessionId, imageId);
      if (result.success) {
        await fetchImages();
      }
    } catch {
      // Remove failed
    } finally {
      setRemovingId(null);
    }
  }, [sessionId, fetchImages]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-4">
        <div>
          <h1
            className="font-bold"
            style={{ fontSize: '24px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            Local Image Library
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            Manage and deploy cached images from the production registry.
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-3 px-6 pb-4">
        <MiniStatCard label="Total Images" value={String(total)} />
        <MiniStatCard label="Storage Used" value={totalSize} valueColor="#66d9cc" />
        <MiniStatCard label="Unused Images" value={String(unusedCount)} valueColor="#facc15" />
        <MiniStatCard
          label="Status"
          value="Available"
          valueColor="#4ade80"
          icon="check_circle"
        />
      </div>

      {/* Search Bar */}
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
            placeholder="Search images..."
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
          onClick={fetchImages}
          className="p-2 rounded-md cursor-pointer transition-colors"
          style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-muted)' }}
          title="Refresh images"
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
                {['Image Name', 'Tag', 'Size', 'Created', 'Actions'].map(h => (
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
                  <td colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className="w-5 h-5 border-2 rounded-full animate-spin"
                        style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
                      />
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Loading images...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredImages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <span
                        className="material-symbols-rounded"
                        style={{ fontSize: '32px', color: 'var(--color-text-muted)', fontVariationSettings: "'FILL' 0, 'wght' 200" }}
                      >
                        layers
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {searchQuery ? 'No images match your search' : 'No images found'}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredImages.map((img) => (
                <tr
                  key={`${img.id}-${img.tag}`}
                  className="transition-colors"
                  style={{ borderBottom: '1px solid var(--color-border-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,109,250,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Image Name */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="material-symbols-rounded flex-shrink-0"
                        style={{
                          fontSize: '16px',
                          color: 'var(--color-primary)',
                          fontVariationSettings: "'FILL' 0, 'wght' 300",
                        }}
                      >
                        layers
                      </span>
                      <span
                        className="font-semibold"
                        style={{
                          fontSize: '13px',
                          color: img.repository === '<none>'
                            ? 'var(--color-text-muted)'
                            : 'var(--color-text-primary)',
                        }}
                      >
                        {img.repository === '<none>' ? '<unnamed>' : img.repository}
                      </span>
                    </div>
                  </td>

                  {/* Tag */}
                  <td className="px-4 py-3.5">
                    <span
                      className="font-mono px-2 py-0.5 rounded"
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-text-secondary)',
                        background: 'var(--color-bg-base)',
                        border: '1px solid var(--color-border-muted)',
                      }}
                    >
                      {img.tag === '<none>' ? '-' : img.tag}
                    </span>
                  </td>

                  {/* Size */}
                  <td className="px-4 py-3.5">
                    <span
                      className="font-mono"
                      style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}
                    >
                      {img.size}
                    </span>
                  </td>

                  {/* Created */}
                  <td className="px-4 py-3.5">
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {img.createdSince ?? img.createdAt}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleRemoveImage(img.id)}
                        disabled={removingId === img.id}
                        title="Remove Image"
                        className="w-7 h-7 rounded flex items-center justify-center cursor-pointer transition-colors disabled:opacity-40"
                        style={{ color: '#f87171', background: 'transparent', border: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {removingId === img.id ? (
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        {!loading && filteredImages.length > 0 && (
          <div className="mt-3 pb-4">
            <p
              className="uppercase tracking-[0.1em] font-semibold"
              style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
            >
              Showing {filteredImages.length} of {total} images
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-components

function MiniStatCard({
  label,
  value,
  valueColor = 'var(--color-text-primary)',
  icon,
}: {
  label: string;
  value: string;
  valueColor?: string;
  icon?: string;
}) {
  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
    >
      <p
        className="uppercase tracking-[0.1em] font-semibold"
        style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}
      >
        {label}
      </p>
      <p className="font-bold mt-1 flex items-center gap-1.5" style={{ fontSize: '18px', color: valueColor }}>
        {icon && (
          <span
            className="material-symbols-rounded"
            style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1, 'wght' 400" }}
          >
            {icon}
          </span>
        )}
        {value}
      </p>
    </div>
  );
}

// Utilities

function parseSizeToBytes(size: string): number {
  if (!size) return 0;
  const num = parseFloat(size);
  if (isNaN(num)) return 0;
  if (size.includes('GB')) return num * 1024 * 1024 * 1024;
  if (size.includes('MB')) return num * 1024 * 1024;
  if (size.includes('KB') || size.includes('kB')) return num * 1024;
  if (size.includes('B')) return num;
  return num;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(val >= 100 ? 0 : 1)} ${units[i]}`;
}
