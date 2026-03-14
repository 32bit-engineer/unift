/**
 * useAsync Hook
 * Manages async operations with loading and error states
 */

import { useState, useEffect, useCallback } from 'react';

interface UseAsyncState<T> {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: T;
  error?: Error;
}

export function useAsync<T>(
  asyncFunction: () => Promise<T>,
  immediate: boolean = true,
  dependencies: any[] = []
) {
  const [state, setState] = useState<UseAsyncState<T>>({
    status: 'idle',
  });

  const execute = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const response = await asyncFunction();
      setState({ status: 'success', data: response });
      return response;
    } catch (error) {
      setState({ status: 'error', error: error as Error });
      throw error;
    }
  }, dependencies);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return { ...state, execute };
}
