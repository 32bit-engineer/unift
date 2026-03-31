import { create } from 'zustand';
import type { TransferStatusResponse } from '@/utils/remoteConnectionAPI';

interface TransferStoreState {
  /*
   * All known transfers grouped by the session that owns them.
   * FileBrowser syncs its local poll results here so the global popup
   * and history page can reflect live state without re-fetching independently.
   */
  transfersBySession: Record<string, TransferStatusResponse[]>;

  setTransfers: (sessionId: string, transfers: TransferStatusResponse[]) => void;
  clearSession: (sessionId: string) => void;
}

export const useTransferStore = create<TransferStoreState>((set) => ({
  transfersBySession: {},

  setTransfers: (sessionId, transfers) =>
    set((state) => ({
      transfersBySession: {
        ...state.transfersBySession,
        [sessionId]: transfers,
      },
    })),

  clearSession: (sessionId) =>
    set((state) => {
      const next = { ...state.transfersBySession };
      delete next[sessionId];
      return { transfersBySession: next };
    }),
}));
