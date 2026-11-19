import { beforeEach, describe, expect, it } from 'vitest';
import {
  BOTTOM_MIN, LAUNCHER_SIZE, NUDGE, POSITION_STORAGE_KEY, TOP_MIN, clampTop, nudge, parsePosition, ratioFromTop, readPosition, settle, snapSide, topFromRatio, topRange, writePosition,
} from '../dock/dockPosition';

const VH = 800;
const VW = 1200;

describe('where the bubble may sit', () => {
  it('keeps it clear of the pinned header above and the pinned footer below', () => {
    expect(topRange(VH)).toEqual({ min: TOP_MIN, max: VH - LAUNCHER_SIZE - BOTTOM_MIN });
    expect(clampTop(-50, VH)).toBe(TOP_MIN);
    expect(clampTop(10_000, VH)).toBe(VH - LAUNCHER_SIZE - BOTTOM_MIN);
    expect(clampTop(300, VH)).toBe(300);
  });

  it('copes with a window too short to have any room', () => {
    expect(clampTop(300, 100)).toBe(TOP_MIN);
    expect(ratioFromTop(300, 100)).toBe(1);
  });

  it('turns a height into a share of the room and back, so a resize keeps it sensible', () => {
    expect(topFromRatio(0, VH)).toBe(TOP_MIN);
    expect(topFromRatio(1, VH)).toBe(VH - LAUNCHER_SIZE - BOTTOM_MIN);
    expect(topFromRatio(0.5, VH)).toBe(Math.round((TOP_MIN + VH - LAUNCHER_SIZE - BOTTOM_MIN) / 2));
    expect(ratioFromTop(topFromRatio(0.25, VH), VH)).toBeCloseTo(0.25, 2);
    expect(topFromRatio(0.5, 400)).toBeLessThan(topFromRatio(0.5, VH));
  });
});

describe('settling on an edge', () => {
  it('goes to whichever edge its centre is nearer', () => {
    expect(snapSide(100, VW)).toBe('left');
    expect(snapSide(900, VW)).toBe('right');
    expect(snapSide(VW / 2, VW)).toBe('right');
  });

  it('keeps the height it was dropped at, within the allowed range', () => {
    expect(settle(20, 300, VW, VH)).toEqual({ side: 'left', y: ratioFromTop(300, VH) });
    expect(settle(1100, 5000, VW, VH)).toEqual({ side: 'right', y: 1 });
    expect(settle(1100, -40, VW, VH)).toEqual({ side: 'right', y: 0 });
  });
});

describe('moving it with the keyboard', () => {
  it('moves up and down in steps, and swaps edge with left and right', () => {
    const start = { side: 'right' as const, y: 0.5 };
    const span = VH - LAUNCHER_SIZE - BOTTOM_MIN - TOP_MIN;
    expect(nudge(start, 'ArrowUp', VH)?.y).toBeCloseTo(0.5 - NUDGE / span, 5);
    expect(nudge(start, 'ArrowDown', VH)?.y).toBeCloseTo(0.5 + NUDGE / span, 5);
    expect(nudge(start, 'ArrowLeft', VH)).toEqual({ side: 'left', y: 0.5 });
    expect(nudge({ side: 'left', y: 0.5 }, 'ArrowRight', VH)).toEqual({ side: 'right', y: 0.5 });
  });

  it('starts from the default corner when there is no saved position, and never leaves the range', () => {
    expect(nudge(null, 'ArrowUp', VH)?.side).toBe('right');
    expect(nudge({ side: 'right', y: 0 }, 'ArrowUp', VH)?.y).toBe(0);
    expect(nudge({ side: 'right', y: 1 }, 'ArrowDown', VH)?.y).toBe(1);
  });

  it('ignores any other key', () => {
    expect(nudge(null, 'a', VH)).toBeNull();
    expect(nudge(null, 'Enter', VH)).toBeNull();
  });
});

describe('remembering it', () => {
  beforeEach(() => window.localStorage.clear());

  it('round trips, and clears', () => {
    writePosition({ side: 'left', y: 0.3 });
    expect(readPosition()).toEqual({ side: 'left', y: 0.3 });
    writePosition(null);
    expect(readPosition()).toBeNull();
  });

  it('ignores anything it did not write', () => {
    for (const bad of [null, '', 'nope', '{"side":"top","y":0.3}', '{"side":"left"}', '{"side":"left","y":"x"}', '[1]']) expect(parsePosition(bad)).toBeNull();
    window.localStorage.setItem(POSITION_STORAGE_KEY, 'garbage');
    expect(readPosition()).toBeNull();
  });

  it('keeps a saved height inside 0 to 1', () => {
    expect(parsePosition('{"side":"right","y":7}')).toEqual({ side: 'right', y: 1 });
    expect(parsePosition('{"side":"right","y":-2}')).toEqual({ side: 'right', y: 0 });
  });

  it('survives storage being blocked', () => {
    const orig = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    expect(readPosition()).toBeNull();
    expect(() => writePosition({ side: 'left', y: 0.5 })).not.toThrow();
    Object.defineProperty(window, 'localStorage', orig);
  });
});
