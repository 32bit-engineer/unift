import { useCallback, useEffect, useState } from 'react';
import { remoteConnectionAPI } from '@/utils/remoteConnectionAPI';
import type { K8sNamespace } from '@/utils/remoteConnectionAPI';

/**
 * Fetches the list of Kubernetes namespaces for a session.
 * Failures are silenced so the namespace dropdown simply remains empty.
 */
export function useK8sNamespaces(sessionId: string) {
  const [namespaces, setNamespaces] = useState<K8sNamespace[]>([]);

  const fetchNamespaces = useCallback(async () => {
    try {
      const nsList = await remoteConnectionAPI.listK8sNamespaces(sessionId);
      setNamespaces(nsList);
    } catch { /* silent — ns dropdown stays empty */ }
  }, [sessionId]);

  useEffect(() => {
    fetchNamespaces();
  }, [fetchNamespaces]);

  return namespaces;
}
