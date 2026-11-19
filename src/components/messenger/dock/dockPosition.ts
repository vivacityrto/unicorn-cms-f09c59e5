/**
 * Where the messenger bubble sits, so it can be dragged out of the way of whatever it covers.
 *
 * It snaps to the left or right edge when let go (like a chat head), keeps its height, and is remembered on this device. The
 * height is kept as a share of the usable space (0 at the top, 1 at the bottom) so it stays sensible when the window is resized.
 * Never null-checked in the component: no saved position means "the default corner" (bottom right, above the footer).
 */

export type DockSide = 'left' | 'right';

export interface DockPosition {
  side: DockSide;
  /** 0 is as high as it may go, 1 as low as it may go. */
  y: number;
}

export const LAUNCHER_SIZE = 56;
/** Gap between the bubble and the side of the window. */
export const EDGE_GAP = 20;
/** Clear of the pinned header (44px) when it condenses. */
export const TOP_MIN = 56;
/** Clear of the pinned footer (25px) with room to breathe. */
export const BOTTOM_MIN = 48;
/** How far a press must move before it counts as a drag and not a click. */
export const DRAG_THRESHOLD = 6;
/** How far Shift + an arrow key moves the bubble. */
export const NUDGE = 32;

export const POSITION_STORAGE_KEY = 'messenger:dock-position';

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));

/** The highest and lowest the top of the bubble may be, for a window this tall. */
export function topRange(viewportHeight: number): { min: number; max: number } {
  const min = TOP_MIN;
  return { min, max: Math.max(min, viewportHeight - LAUNCHER_SIZE - BOTTOM_MIN) };
}

export function clampTop(top: number, viewportHeight: number): number {
  const { min, max } = topRange(viewportHeight);
  return clamp(top, min, max);
}

export function topFromRatio(y: number, viewportHeight: number): number {
  const { min, max } = topRange(viewportHeight);
  return Math.round(min + clamp(y, 0, 1) * (max - min));
}

export function ratioFromTop(top: number, viewportHeight: number): number {
  const { min, max } = topRange(viewportHeight);
  if (max <= min) return 1;
  return clamp((top - min) / (max - min), 0, 1);
}

/** Which edge the bubble settles on, from where its centre is. */
export function snapSide(centreX: number, viewportWidth: number): DockSide {
  return centreX < viewportWidth / 2 ? 'left' : 'right';
}

/** Where a bubble dropped with its top-left corner at (left, top) comes to rest. */
export function settle(left: number, top: number, viewportWidth: number, viewportHeight: number): DockPosition {
  return { side: snapSide(left + LAUNCHER_SIZE / 2, viewportWidth), y: ratioFromTop(clampTop(top, viewportHeight), viewportHeight) };
}

/** Shift + an arrow key: up and down move it, left and right swap the edge. Other keys do nothing (null). */
export function nudge(current: DockPosition | null, key: string, viewportHeight: number): DockPosition | null {
  const base: DockPosition = current ?? { side: 'right', y: 1 };
  const { min, max } = topRange(viewportHeight);
  const span = Math.max(1, max - min);
  switch (key) {
    case 'ArrowUp':
      return { ...base, y: clamp(base.y - NUDGE / span, 0, 1) };
    case 'ArrowDown':
      return { ...base, y: clamp(base.y + NUDGE / span, 0, 1) };
    case 'ArrowLeft':
      return { ...base, side: 'left' };
    case 'ArrowRight':
      return { ...base, side: 'right' };
    default:
      return null;
  }
}

/** A saved position, or null when there is none or it is not one we wrote. */
export function parsePosition(raw: string | null): DockPosition | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<DockPosition>;
    if ((v.side === 'left' || v.side === 'right') && typeof v.y === 'number' && Number.isFinite(v.y)) {
      return { side: v.side, y: clamp(v.y, 0, 1) };
    }
  } catch {
    /* not ours */
  }
  return null;
}

/** Storage can be blocked (private windows, site data off), so every access is guarded and the bubble just uses the default corner. */
export function readPosition(): DockPosition | null {
  try {
    return parsePosition(window.localStorage.getItem(POSITION_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writePosition(position: DockPosition | null): void {
  try {
    if (position) window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
    else window.localStorage.removeItem(POSITION_STORAGE_KEY);
  } catch {
    /* the position just will not be remembered */
  }
}
