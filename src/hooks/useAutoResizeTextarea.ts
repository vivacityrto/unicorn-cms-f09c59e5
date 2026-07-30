import { useLayoutEffect, useRef } from 'react';

/**
 * Grows a textarea to fit its content height (up to an optional max) so the
 * full value is visible without the user needing to manually drag-resize it.
 * Recalculates whenever `value` changes, including on initial mount (e.g.
 * when a dialog opens pre-filled with a long description).
 */
export function useAutoResizeTextarea<T extends HTMLTextAreaElement>(value: string, maxHeightPx?: number) {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = maxHeightPx ? Math.min(el.scrollHeight, maxHeightPx) : el.scrollHeight;
    el.style.height = `${next}px`;
    el.style.overflowY = maxHeightPx && el.scrollHeight > maxHeightPx ? 'auto' : 'hidden';
  }, [value, maxHeightPx]);

  return ref;
}
