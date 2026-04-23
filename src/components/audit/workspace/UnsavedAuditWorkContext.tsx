import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';

/**
 * Tracks unsaved free-text edits across the audit workspace so that:
 * - We can show a "Saving…" / "All changes saved" indicator
 * - We can warn the user via beforeunload if they try to close while a debounce
 *   timer hasn't fired yet
 *
 * Fields call `markDirty()` when the user types and `markClean()` once the
 * mutation succeeds. The hook returns stable callbacks so they can sit in
 * dependency arrays safely.
 */

type Status = 'idle' | 'saving' | 'saved';

interface UnsavedAuditWorkValue {
  markDirty: () => void;
  markClean: () => void;
  status: Status;
  /** Increments every time we transition from saving -> saved. */
  lastSavedKey: number;
  isDirty: boolean;
}

const UnsavedAuditWorkContext = createContext<UnsavedAuditWorkValue | null>(null);

export function UnsavedAuditWorkProvider({ children }: { children: ReactNode }) {
  // Use a ref so that markDirty/markClean are stable and don't trigger
  // re-renders on every keystroke. We mirror the count into state only when
  // the dirty/clean transition matters for the indicator.
  const dirtyCountRef = useRef(0);
  const [status, setStatus] = useState<Status>('idle');
  const [lastSavedKey, setLastSavedKey] = useState(0);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const markDirty = useCallback(() => {
    dirtyCountRef.current += 1;
    setStatus('saving');
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = undefined;
    }
  }, []);

  const markClean = useCallback(() => {
    dirtyCountRef.current = Math.max(0, dirtyCountRef.current - 1);
    if (dirtyCountRef.current === 0) {
      setStatus('saved');
      setLastSavedKey(k => k + 1);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setStatus('idle'), 2500);
    }
  }, []);

  // beforeunload — only attached when something is dirty, so we don't annoy
  // users on clean pages. We re-attach on every status change because the
  // browser only checks the listener at unload time.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyCountRef.current > 0) {
        e.preventDefault();
        // Required for Chrome
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  return (
    <UnsavedAuditWorkContext.Provider
      value={{ markDirty, markClean, status, lastSavedKey, isDirty: status === 'saving' }}
    >
      {children}
    </UnsavedAuditWorkContext.Provider>
  );
}

/**
 * Returns no-op callbacks if used outside a provider, so individual field
 * components remain safe to render in tests / standalone contexts.
 */
export function useUnsavedAuditWork(): UnsavedAuditWorkValue {
  const ctx = useContext(UnsavedAuditWorkContext);
  if (ctx) return ctx;
  return {
    markDirty: () => {},
    markClean: () => {},
    status: 'idle',
    lastSavedKey: 0,
    isDirty: false,
  };
}
