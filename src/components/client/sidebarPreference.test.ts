import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SIDEBAR_STORAGE_KEY, readSidebarPreference, writeSidebarPreference } from './sidebarPreference';

const setWidth = (desktop: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: desktop && q.includes('768'), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  window.localStorage.clear();
  setWidth(true);
});

describe('the client sidebar preference', () => {
  it('starts collapsed to icons for someone who has never chosen', () => {
    expect(readSidebarPreference()).toBe(false);
  });

  it('remembers when someone widens it, and when they collapse it again', () => {
    writeSidebarPreference(true);
    expect(readSidebarPreference()).toBe(true);
    writeSidebarPreference(false);
    expect(readSidebarPreference()).toBe(false);
  });

  it('never opens on a phone, and never saves what the phone overlay was doing', () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'true');
    setWidth(false);
    expect(readSidebarPreference()).toBe(false);
    writeSidebarPreference(true);
    setWidth(true);
    // The desktop choice is untouched by the phone.
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('true');
  });

  it('survives storage being blocked', () => {
    const orig = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    expect(readSidebarPreference()).toBe(false);
    expect(() => writeSidebarPreference(true)).not.toThrow();
    Object.defineProperty(window, 'localStorage', orig);
  });
});
