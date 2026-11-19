import { createContext, useContext } from 'react';

export interface DockState {
  open: boolean;
  selectedId: string | null;
  /** Open the dock, on the thread list or straight onto one thread. */
  openDock: (threadId?: string | null) => void;
  closeDock: () => void;
  select: (id: string | null) => void;
}

export const DockContext = createContext<DockState | null>(null);

/** Open or close the messenger bubble from anywhere inside the provider (for example a "Message your consultant" button). */
export function useMessengerDock(): DockState {
  const ctx = useContext(DockContext);
  if (!ctx) throw new Error('useMessengerDock must be used inside MessengerDockProvider');
  return ctx;
}
