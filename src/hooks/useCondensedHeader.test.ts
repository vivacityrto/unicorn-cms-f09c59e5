import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCondensedHeader } from './useCondensedHeader';

function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  act(() => {
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);
  });
}

describe('useCondensedHeader', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });
  afterEach(() => vi.useRealTimers());

  it('starts full size and condenses only after scrolling well down', () => {
    const { result } = renderHook(() => useCondensedHeader());
    expect(result.current).toBe(false);
    scrollTo(30);
    expect(result.current).toBe(false);
    scrollTo(60);
    expect(result.current).toBe(true);
  });

  it('stays condensed through small scrolls and only expands near the top (no flicker at the edge)', () => {
    const { result } = renderHook(() => useCondensedHeader());
    scrollTo(200);
    expect(result.current).toBe(true);
    scrollTo(40);
    expect(result.current).toBe(true);
    scrollTo(20);
    expect(result.current).toBe(true);
    scrollTo(4);
    expect(result.current).toBe(false);
  });

  it('is already condensed when the page loads part way down', () => {
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true });
    const { result } = renderHook(() => useCondensedHeader());
    expect(result.current).toBe(true);
  });

  it('stops listening when it unmounts', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useCondensedHeader());
    unmount();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
