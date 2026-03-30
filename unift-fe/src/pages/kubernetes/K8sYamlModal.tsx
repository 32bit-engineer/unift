/**
 * K8sYamlModal — shared modal for viewing and editing live YAML of any
 * Kubernetes resource (Pod, Deployment, Service, Node, etc.).
 *
 * Features:
 *   - Fetches the cleaned YAML from the server on open
 *   - Toggles between a syntax-highlighted read view and a plain textarea editor
 *   - Saves via server-side-apply (PUT /resources/yaml, text/plain)
 *   - Nodes are opened in read-only mode — editing cluster nodes is unsafe
 *   - Copy button copies the current editor content to clipboard
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { ResourceYaml } from '@/utils/remoteConnectionAPI';

export interface YamlModalTarget {
  kind: string;
  namespace: string;
  name: string;
  readOnly?: boolean;
}

interface K8sYamlModalProps {
  sessionId: string;
  target: YamlModalTarget;
  onClose: () => void;
}

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export function K8sYamlModal({ sessionId, target, onClose }: K8sYamlModalProps) {
  const [yaml, setYaml] = useState<ResourceYaml | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editorValue, setEditorValue] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const fetchYaml = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await remoteConnectionAPI.getResourceYaml(
        sessionId, target.kind, target.namespace, target.name,
      );
      setYaml(res);
      setEditorValue(res.yaml);
    } catch (err) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Failed to load YAML';
      setFetchError(msg);
    } finally {
      setLoading(false);
    }
  }, [sessionId, target]);

  useEffect(() => { fetchYaml(); }, [fetchYaml]);

  // When editing mode is activated, focus the Monaco editor
  useEffect(() => {
    if (editing) editorRef.current?.focus();
  }, [editing]);

  const handleCopy = () => {
    const content = yaml?.yaml ?? '';
    navigator.clipboard.writeText(editing ? editorValue : content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleSave = async () => {
    setSaveState('saving');
    setSaveError(null);
    try {
      await remoteConnectionAPI.applyResourceYaml(sessionId, editorValue);
      setSaveState('success');
      // Refresh displayed yaml from server after a short delay
      setTimeout(async () => {
        setSaveState('idle');
        setEditing(false);
        await fetchYaml();
      }, 1200);
    } catch (err) {
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Apply failed';
      setSaveError(msg);
      setSaveState('error');
    }
  };

  const handleDiscard = () => {
    setEditing(false);
    setEditorValue(yaml?.yaml ?? '');
    setSaveState('idle');
    setSaveError(null);
  };

  const isReadOnly = target.readOnly === true;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)',
        }}
      />

      {/* Modal panel */}
      <div style={{
        position: 'fixed', top: '4%', left: '8%', right: '8%', bottom: '4%',
        zIndex: 1101, background: '#0B0B14', borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 28px 80px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px', flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* Kind badge + resource name */}
          <div style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(124,109,250,0.12)', border: '1px solid rgba(124,109,250,0.2)',
          }}>
            <span
              className="material-symbols-rounded"
              style={{ fontSize: 16, color: '#7C6DFA', fontVariationSettings: "'FILL' 0, 'wght' 300" }}
            >
              description
            </span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                background: 'rgba(124,109,250,0.15)', color: '#c6bfff',
                fontFamily: "'DM Mono', monospace", letterSpacing: 0.5, textTransform: 'uppercase',
              }}>
                {target.kind}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {target.name}
              </span>
              {target.namespace && target.namespace !== '_cluster' && (
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'DM Mono', monospace" }}>
                  / {target.namespace}
                </span>
              )}
              {isReadOnly && (
                <span style={{
                  padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: 'rgba(250,204,21,0.12)', color: '#facc15',
                  letterSpacing: 0.5, textTransform: 'uppercase',
                }}>
                  Read-only
                </span>
              )}
            </div>
          </div>

          {/* Toolbar — Copy, Edit/Discard, Save, Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Copy */}
            <button
              onClick={handleCopy}
              style={toolbarBtnStyle()}
              title="Copy YAML"
            >
              <span
                className="material-symbols-rounded"
                style={{ fontSize: 14, fontVariationSettings: "'FILL' 0, 'wght' 300" }}
              >
                {copied ? 'check' : 'content_copy'}
              </span>
              {copied ? 'Copied' : 'Copy'}
            </button>

            {/* Edit / Discard */}
            {!isReadOnly && !editing && (
              <button
                onClick={() => setEditing(true)}
                disabled={loading || !!fetchError}
                style={toolbarBtnStyle('#7C6DFA')}
              >
                <span
                  className="material-symbols-rounded"
                  style={{ fontSize: 14, fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                >
                  edit
                </span>
                Edit
              </button>
            )}

            {editing && (
              <button onClick={handleDiscard} style={toolbarBtnStyle()}>
                <span className="material-symbols-rounded" style={{ fontSize: 14 }}>undo</span>
                Discard
              </button>
            )}

            {/* Save */}
            {editing && (
              <button
                onClick={handleSave}
                disabled={saveState === 'saving'}
                style={toolbarBtnStyle(undefined, true)}
              >
                <span
                  className="material-symbols-rounded"
                  style={{
                    fontSize: 14, fontVariationSettings: "'FILL' 0, 'wght' 300",
                    animation: saveState === 'saving' ? 'spin 1s linear infinite' : undefined,
                  }}
                >
                  {saveState === 'saving' ? 'progress_activity'
                    : saveState === 'success' ? 'check_circle'
                    : 'save'}
                </span>
                {saveState === 'saving' ? 'Applying…'
                  : saveState === 'success' ? 'Applied'
                  : 'Apply'}
              </button>
            )}

            {/* Close */}
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', padding: 6, borderRadius: 6,
                display: 'flex', alignItems: 'center',
              }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>
        </div>

        {/* Save error banner */}
        {saveError && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 20px', background: 'rgba(248,113,113,0.08)',
            borderBottom: '1px solid rgba(248,113,113,0.15)', flexShrink: 0,
          }}>
            <span className="material-symbols-rounded" style={{ fontSize: 15, color: '#f87171' }}>error</span>
            <span style={{ fontSize: 12, color: '#f87171', flex: 1 }}>{saveError}</span>
            <button
              onClick={() => { setSaveError(null); setSaveState('idle'); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 2 }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: 14 }}>close</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {loading && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
            }}>
              <span
                className="material-symbols-rounded"
                style={{ fontSize: 32, color: '#7C6DFA', animation: 'spin 1s linear infinite' }}
              >
                progress_activity
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Fetching YAML for {target.kind}/{target.name}…
              </span>
            </div>
          )}

          {fetchError && !loading && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
            }}>
              <span className="material-symbols-rounded" style={{ fontSize: 40, color: '#f87171' }}>error_outline</span>
              <span style={{ fontSize: 13, color: '#f87171' }}>{fetchError}</span>
              <button
                onClick={fetchYaml}
                style={{
                  padding: '7px 18px', borderRadius: 8, border: 'none',
                  background: 'var(--primary, #7C6DFA)', color: '#fff',
                  cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !fetchError && yaml && (
            <Editor
              height="100%"
              language="yaml"
              value={editing ? editorValue : yaml.yaml}
              theme="vs-dark"
              onMount={(editor) => { editorRef.current = editor; }}
              onChange={(value) => {
                if (editing && !isReadOnly && value !== undefined) setEditorValue(value);
              }}
              options={{
                readOnly: !editing || isReadOnly,
                fontFamily: "'DM Mono', 'Fira Mono', monospace",
                fontSize: 12,
                lineHeight: 20,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                lineNumbers: 'on',
                wordWrap: 'off',
                scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                glyphMargin: false,
                folding: true,
                smoothScrolling: true,
                quickSuggestions: false,
              }}
            />
          )}
        </div>

        {/* Footer — mode indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '7px 20px', borderTop: '1px solid rgba(255,255,255,0.04)',
          flexShrink: 0, background: 'rgba(0,0,0,0.25)',
        }}>
          <span style={{ fontSize: 10, color: '#3a4058', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {editing ? 'Edit mode — changes applied via server-side-apply' : 'View mode'}
          </span>
          {yaml && (
            <span style={{ fontSize: 10, color: '#3a4058', marginLeft: 'auto' }}>
              {yaml.yaml.split('\n').length} lines
            </span>
          )}
        </div>
      </div>
    </>
  );
}

function toolbarBtnStyle(
  accentColor?: string,
  isPrimary?: boolean,
): React.CSSProperties {
  if (isPrimary) {
    return {
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 6, border: 'none',
      background: 'var(--primary, #7C6DFA)', color: '#fff',
      cursor: 'pointer', fontSize: 11, fontWeight: 600,
    };
  }
  return {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 12px', borderRadius: 6,
    border: `1px solid ${accentColor ? `${accentColor}40` : 'rgba(255,255,255,0.08)'}`,
    background: accentColor ? `${accentColor}12` : 'rgba(255,255,255,0.04)',
    color: accentColor ?? 'var(--text-secondary)',
    cursor: 'pointer', fontSize: 11, fontWeight: 500,
  };
}

