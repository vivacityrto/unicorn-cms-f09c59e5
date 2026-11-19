/**
 * The client sidebar opens collapsed to icons (names float beside them on hover) unless someone pins it open with the pin in
 * its header. That pin is the only thing saved: opening or closing the menu while working lasts for that visit.
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

/** The staff portal's own setting. Unlike the client portal it starts open, as it always has, unless someone pins it closed. */
export const STAFF_SIDEBAR_STORAGE_KEY = 'staff-sidebar-open';

/** The staff layout has always judged "desktop" by the window width (768px and up), so the setting does too. */
const staffIsDesktop = () => typeof window === 'undefined' || window.innerWidth >= 768;

/** Whether the staff sidebar starts open on a laptop or desktop. Open unless this person chose otherwise on this device. */
export function readStaffSidebarDefault(): boolean {
  if (!staffIsDesktop()) return false;
  try {
    return window.localStorage.getItem(STAFF_SIDEBAR_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function writeStaffSidebarDefault(open: boolean): void {
  if (!staffIsDesktop()) return;
  try {
    window.localStorage.setItem(STAFF_SIDEBAR_STORAGE_KEY, open ? 'true' : 'false');
  } catch {
    /* the choice just will not be remembered */
  }
}
