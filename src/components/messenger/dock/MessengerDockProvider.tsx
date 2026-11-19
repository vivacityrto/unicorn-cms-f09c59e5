import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { DockContext, type DockState } from './dockContext';

/** Holds whether the messenger bubble is open and which thread is on screen, so any page can open it. */
export function MessengerDockProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openDock = useCallback((threadId?: string | null) => {
    if (threadId !== undefined) setSelectedId(threadId);
    setOpen(true);
  }, []);
  const closeDock = useCallback(() => setOpen(false), []);
  const value = useMemo<DockState>(() => ({ open, selectedId, openDock, closeDock, select: setSelectedId }), [open, selectedId, openDock, closeDock]);
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}
