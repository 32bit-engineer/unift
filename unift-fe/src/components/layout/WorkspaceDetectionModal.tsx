// Workspace detection modal — shown after connecting to a session to detect
// available capabilities (Docker, kubectl) and ask the user which dedicated
// dashboard they want. Results are persisted to the saved host config so
// reconnections restore the same workspace type automatically.
import { useState, useEffect, useCallback } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { WorkspaceType } from '@/utils/remoteConnectionAPI';

type DetectPhase = 'detecting' | 'choosing' | 'done';

interface DetectedCapabilities {
  docker: boolean;
  kubernetes: boolean;
}

interface WorkspaceDetectionModalProps {
  sessionId: string;
  /** If set, skip detection and show the choice screen directly. */
  savedHostId?: string;
  onComplete: (chosen: WorkspaceType, capabilities: DetectedCapabilities) => void;
  onSkip: () => void;
}

const TYPE_CARDS: Array<{
  type: WorkspaceType;
  label: string;
  icon: string;
  description: string;
  requiresCapability?: 'docker' | 'kubernetes';
}> = [
  {
    type: 'ssh',
    label: 'SSH Workspace',
    icon: 'terminal',
    description: 'Terminal, file browser, and monitoring for this remote host.',
  },
  {
    type: 'docker',
    label: 'Docker Dashboard',
    icon: 'view_in_ar',
    description: 'Manage containers, images, and Docker resources.',
    requiresCapability: 'docker',
  },
  {
    type: 'kubernetes',
    label: 'Kubernetes Dashboard',
    icon: 'deployed_code',
    description: 'Manage pods, deployments, services, and nodes.',
    requiresCapability: 'kubernetes',
  },
];

export function WorkspaceDetectionModal({
  sessionId,
  onComplete,
  onSkip,
}: WorkspaceDetectionModalProps) {
  const [phase, setPhase] = useState<DetectPhase>('detecting');
  const [capabilities, setCapabilities] = useState<DetectedCapabilities>({
    docker: false,
    kubernetes: false,
  });
  const [selectedType, setSelectedType] = useState<WorkspaceType>('ssh');

  // Run capability detection on mount
  useEffect(() => {
    let cancelled = false;

    async function detect() {
      try {
        const [dockerResult, k8sResult] = await Promise.allSettled([
          remoteConnectionAPI.checkDockerAvailable(sessionId),
          remoteConnectionAPI.checkKubectlAvailable(sessionId),
        ]);

        if (cancelled) return;

        const dockerAvailable =
          dockerResult.status === 'fulfilled' && dockerResult.value.available;
        const k8sAvailable =
          k8sResult.status === 'fulfilled' && k8sResult.value.available;

        const caps = { docker: dockerAvailable, kubernetes: k8sAvailable };
        setCapabilities(caps);

        // If nothing detected beyond SSH, go straight to SSH workspace
        if (!dockerAvailable && !k8sAvailable) {
          onComplete('ssh', caps);
          return;
        }

        // Pre-select the most advanced capability
        if (k8sAvailable) {
          setSelectedType('kubernetes');
        } else if (dockerAvailable) {
          setSelectedType('docker');
        }

        setPhase('choosing');
      } catch {
        if (!cancelled) {
          // On detection failure, fall back to SSH
          onComplete('ssh', { docker: false, kubernetes: false });
        }
      }
    }

    detect();
    return () => { cancelled = true; };
  }, [sessionId, onComplete]);

  const handleConfirm = useCallback(() => {
    setPhase('done');
    onComplete(selectedType, capabilities);
  }, [selectedType, capabilities, onComplete]);

  // During detection, show a loading overlay
  if (phase === 'detecting') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
        <div
          className="rounded-lg p-8 flex flex-col items-center gap-4 max-w-sm w-full mx-4"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
        >
          <div
            className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--color-border-muted)', borderTopColor: 'var(--color-primary)' }}
          />
          <div className="text-center">
            <p className="text-sm font-medium" style={{ color: 'var(--color-text-warm)' }}>
              Detecting capabilities...
            </p>
            <p className="text-xs mt-1" style={{ color: '#5a6380' }}>
              Checking for Docker and Kubernetes on the remote host
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'done') return null;

  // Choosing phase — show capability cards
  const availableCards = TYPE_CARDS.filter(card => {
    if (!card.requiresCapability) return true;
    return capabilities[card.requiresCapability];
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="rounded-lg p-6 max-w-lg w-full mx-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border-muted)' }}
      >
        {/* Header */}
        <div className="mb-5">
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-warm)' }}>
            Choose your workspace
          </h2>
          <p className="text-xs mt-1" style={{ color: '#5a6380' }}>
            We detected additional capabilities on this host. Select your preferred dashboard.
          </p>
        </div>

        {/* Capability cards */}
        <div className="flex flex-col gap-2 mb-5">
          {availableCards.map(card => {
            const isSelected = selectedType === card.type;
            return (
              <button
                key={card.type}
                onClick={() => setSelectedType(card.type)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all cursor-pointer
                  ${isSelected ? 'ring-1' : 'hover:bg-white/5'}`}
                style={{
                  background: isSelected ? 'rgba(124,109,250,0.08)' : 'transparent',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border-muted)',
                  ...(isSelected ? { ringColor: 'var(--color-primary)' } : {}),
                }}
              >
                <span
                  className="material-symbols-rounded shrink-0 mt-0.5"
                  style={{
                    fontSize: '22px',
                    color: isSelected ? 'var(--color-primary)' : '#5a6380',
                    fontVariationSettings: isSelected
                      ? "'FILL' 1, 'wght' 400"
                      : "'FILL' 0, 'wght' 300",
                  }}
                >
                  {card.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium"
                    style={{ color: isSelected ? 'var(--color-text-warm)' : '#a0a8c0' }}
                  >
                    {card.label}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#5a6380' }}>
                    {card.description}
                  </p>
                </div>
                {isSelected && (
                  <span
                    className="material-symbols-rounded shrink-0"
                    style={{
                      fontSize: '20px',
                      color: 'var(--color-primary)',
                      fontVariationSettings: "'FILL' 1",
                    }}
                  >
                    check_circle
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Detected badges */}
        <div className="flex gap-2 mb-5">
          {capabilities.docker && (
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium"
              style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: '12px' }}>view_in_ar</span>
              Docker detected
            </span>
          )}
          {capabilities.kubernetes && (
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium"
              style={{ background: 'rgba(124,109,250,0.15)', color: '#a78bfa' }}
            >
              <span className="material-symbols-rounded" style={{ fontSize: '12px' }}>deployed_code</span>
              kubectl detected
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onSkip}
            className="px-4 py-2 rounded text-xs font-medium cursor-pointer transition-colors hover:bg-white/5"
            style={{ color: '#5a6380', border: '1px solid var(--color-border-muted)' }}
          >
            Skip
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 rounded text-xs font-medium cursor-pointer brand-gradient brand-gradient-hover text-white"
          >
            Launch {TYPE_CARDS.find(c => c.type === selectedType)?.label}
          </button>
        </div>
      </div>
    </div>
  );
}
