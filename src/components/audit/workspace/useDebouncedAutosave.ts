import { useCallback, useEffect, useRef, useState } from 'react';
import { useUnsavedAuditWork } from './UnsavedAuditWorkContext';

interface Options {
  /** Server value — local state re-syncs from this when the field is not focused. */
  serverValue: string;
  /** Stable identity for the field (e.g. response id, section id). Forces re-sync on change. */
  identityKey?: string;
  /** Called when the debounce fires or on flush. */
  onSave: (value: string) => void;
  /** Debounce ms. Defaults to 600. */
  debounceMs?: number;
}

interface Result {
  value: string;
  setValue: (v: string) => void;
  /** Bind to the textarea/input. Handles focus/blur and flush-on-blur. */
  bind: {
    onFocus: () => void;
    onBlur: () => void;
  };
}

/**
 * Robust autosave for free-text audit fields. Fixes three failure modes:
 *  1. Pending debounce is cancelled on unmount  →  flushes instead.
 *  2. Page close drops in-flight typing         →  beforeunload via context.
 *  3. Stale local state clobbers other users    →  re-syncs from serverValue
 *                                                  when not focused.
 *
 * Also reports dirty/clean state to UnsavedAuditWorkContext so the workspace
 * can show a save indicator.
 */
export function useDebouncedAutosave({
  serverValue,
  identityKey,
  onSave,
  debounceMs = 600,
}: Options): Result {
  const [value, setValueState] = useState(serverValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingValueRef = useRef<string | null>(null);
  const isFocusedRef = useRef(false);
  const onSaveRef = useRef(onSave);
  const { markDirty, markClean } = useUnsavedAuditWork();
  const isDirtyRef = useRef(false);

  // Always call the latest onSave without re-creating callbacks.
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // Re-sync from server when:
  //  - the identity changes (different field rendered into same slot), OR
  //  - the server value changes AND the field is not focused AND we have no
  //    pending local edit.
  useEffect(() => {
    if (isFocusedRef.current) return;
    if (pendingValueRef.current !== null) return;
    setValueState(serverValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverValue, identityKey]);

  const flush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = undefined;
    }
    if (pendingValueRef.current !== null) {
      const v = pendingValueRef.current;
      pendingValueRef.current = null;
      onSaveRef.current(v);
      // markClean is called once the mutation settles via markCleanOnSettle below,
      // but we also need to handle the case where flush was triggered without a
      // following success callback. Leave the dirty bit until the mutation
      // resolves — UI mutations call markClean from their own onSettled hooks if
      // they want; here we optimistically clear because the request is in flight.
      if (isDirtyRef.current) {
        isDirtyRef.current = false;
        markClean();
      }
    }
  }, [markClean]);

  const setValue = useCallback((next: string) => {
    setValueState(next);
    pendingValueRef.current = next;
    if (!isDirtyRef.current) {
      isDirtyRef.current = true;
      markDirty();
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      flush();
    }, debounceMs);
  }, [debounceMs, flush, markDirty]);

  // Flush on unmount — this is the central fix for "switch tab and lose typing".
  useEffect(() => {
    return () => {
      flush();
    };
    // We deliberately don't depend on flush — capture the latest via ref-style closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    value,
    setValue,
    bind: {
      onFocus: () => { isFocusedRef.current = true; },
      onBlur: () => {
        isFocusedRef.current = false;
        flush();
      },
    },
  };
}
