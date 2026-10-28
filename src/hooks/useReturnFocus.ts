import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A dialog opened from state, not from a trigger element, gives Radix nothing to hand
 * focus back to, so closing it drops the keyboard user at the top of the page. This
 * remembers what had focus when the dialog opened and returns it on close. If that
 * control has since left the page (a "Mark as blocked" button disappears once the
 * Rock is blocked) the default behaviour is left alone.
 *
 * Capture happens in a layout effect so it runs before the dialog moves focus inside itself.
 */
export function useReturnFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  return useCallback((event: Event) => {
    const element = opener.current;
    if (element && element.isConnected && element !== document.body) {
      event.preventDefault();
      element.focus();
    }
  }, []);
}
