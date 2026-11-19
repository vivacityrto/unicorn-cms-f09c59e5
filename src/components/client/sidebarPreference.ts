/**
 * The client sidebar opens collapsed to icons (names float beside them on hover) and remembers if someone widens it.
 * Only on a laptop or desktop: on a phone the sidebar is an overlay that starts closed every time, so what the overlay was
 * last doing is never saved.
 */
export const SIDEBAR_STORAGE_KEY = 'client-sidebar-open';

const isDesktop = () => typeof window !== 'undefined' && (window.matchMedia ? window.matchMedia('(min-width: 768px)').matches : window.innerWidth >= 768);

/** Whether the sidebar starts open. Collapsed unless this person chose otherwise on this device. */
export function readSidebarPreference(): boolean {
  if (!isDesktop()) return false;
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeSidebarPreference(open: boolean): void {
  if (!isDesktop()) return;
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, open ? 'true' : 'false');
  } catch {
    /* the choice just will not be remembered */
  }
}
