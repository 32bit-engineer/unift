/**
 * Docker Compose — Lists detected compose projects and provides
 * a YAML generator from running containers with Monaco editor view.
 *
 * Data source: DockerController.listComposeProjects / generateComposeFile
 * via remoteConnectionAPI
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { ComposeProject } from '@/utils/remoteConnectionAPI';

interface DockerComposePageProps {
  sessionId: string;
}

export function DockerComposePage({ sessionId }: DockerComposePageProps) {
  const [projects, setProjects] = useState<ComposeProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [yaml, setYaml] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<{ getValue: () => string } | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const res = await remoteConnectionAPI.listDockerComposeProjects(sessionId);
      setProjects(res);
    } catch {
      // Projects stay empty
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const result = await remoteConnectionAPI.generateDockerComposeFile(sessionId, {
        projectName: 'generated',
        services: {},
      });
      setYaml(result);
    } catch {
      setYaml('# Failed to generate compose file. Try again later.');
    } finally {
      setGenerating(false);
    }
  }, [sessionId]);

  const handleCopy = useCallback(async () => {
    const content = editorRef.current?.getValue() ?? yaml;
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copy failed
    }
  }, [yaml]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-5 pb-4">
        <div>
          <p
            className="uppercase tracking-[0.15em] font-semibold"
            style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
          >
            Operations
          </p>
          <h1
            className="mt-1 font-bold"
            style={{ fontSize: '24px', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
          >
            Docker Compose
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 rounded-md font-semibold cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
            style={{ fontSize: '12px', background: 'var(--color-primary)', color: '#fff' }}
          >
            <span
              className="material-symbols-rounded"
              style={{ fontSize: '16px', fontVariationSettings: "'FILL' 0, 'wght' 400" }}
            >
              auto_awesome
            </span>
            {generating ? 'Generating...' : 'Generate Compose'}
          </button>
          <button
            onClick={fetchProjects}
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
      </div>

      <div className="flex-1 flex gap-4 px-6 pb-5 min-h-0">
        {/* Left: Projects List */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-3">
          <div
            className="rounded-lg p-4 flex-1 overflow-auto"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="font-semibold uppercase tracking-[0.1em]"
                style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
              >
                Detected Projects
              </span>
              <span
                className="font-mono"
                style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}
              >
                {projects.length}
              </span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div
                  className="w-5 h-5 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
                />
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <span
                  className="material-symbols-rounded"
                  style={{ fontSize: '28px', color: 'var(--color-text-muted)', fontVariationSettings: "'FILL' 0, 'wght' 200" }}
                >
                  description
                </span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                  No compose projects detected.
                  Use "Generate Compose" to create from running containers.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {projects.map(p => (
                  <ProjectCard key={p.name} project={p} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: YAML Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span
              className="font-semibold uppercase tracking-[0.1em]"
              style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
            >
              Compose YAML
            </span>
            {yaml && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-3 py-1 rounded-md cursor-pointer transition-colors"
                style={{
                  fontSize: '11px',
                  color: copied ? '#4ade80' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border-muted)',
                }}
              >
                <span
                  className="material-symbols-rounded"
                  style={{ fontSize: '14px', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                >
                  {copied ? 'check' : 'content_copy'}
                </span>
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          <div
            className="flex-1 rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--color-border-muted)' }}
          >
            {yaml ? (
              <Editor
                height="100%"
                language="yaml"
                theme="vs-dark"
                value={yaml}
                onChange={v => setYaml(v ?? '')}
                onMount={editor => { editorRef.current = editor; }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  readOnly: false,
                  padding: { top: 12 },
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <span
                  className="material-symbols-rounded"
                  style={{ fontSize: '40px', color: 'var(--color-text-muted)', fontVariationSettings: "'FILL' 0, 'wght' 200" }}
                >
                  code
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Click "Generate Compose" to create a docker-compose.yml from running containers
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ComposeProject }) {
  const statusColor = project.status === 'running' ? '#4ade80'
    : project.status === 'exited' ? '#f87171'
    : '#facc15';

  return (
    <div
      className="rounded-md p-3 transition-colors"
      style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border-muted)' }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-semibold" style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
          {project.name}
        </span>
        <span
          className="px-2 py-0.5 rounded-full font-semibold uppercase tracking-[0.08em]"
          style={{ fontSize: '9px', color: statusColor, background: `${statusColor}15` }}
        >
          {project.status}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          {project.services.length} services
        </span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          {project.containerCount} containers
        </span>
      </div>
      {project.configFiles && (
        <span
          className="font-mono mt-1 block truncate"
          style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}
          title={project.configFiles}
        >
          {project.configFiles}
        </span>
      )}
    </div>
  );
}
