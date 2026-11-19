import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIDE_AFTER_MS, ScrollToTopButton, wantsBackToTop } from './ScrollToTopButton';

describe('wantsBackToTop', () => {
  it('only offers it deep into a page and while heading up', () => {
    const vh = 800;
    expect(wantsBackToTop(3000, 3100, vh)).toBe(true);
    expect(wantsBackToTop(3100, 3000, vh)).toBe(false); // heading down
    expect(wantsBackToTop(3000, 3002, vh)).toBe(false); // jitter
    expect(wantsBackToTop(900, 1000, vh)).toBe(false); // not deep enough (under 1.5 screens)
    expect(wantsBackToTop(100, 300, vh)).toBe(false); // near the top
  });
});

describe('ScrollToTopButton', () => {
  let y = 0;
  const scrollTo = (to: number) => {
    y = to;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
  };
  const button = () => screen.getByText('Back to top').closest('button')!;

  beforeEach(() => {
    vi.useFakeTimers();
    y = 0;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });
  afterEach(() => vi.useRealTimers());

  it('stays hidden while reading down a page, even a long way', () => {
    render(<ScrollToTopButton />);
    [500, 1500, 3000, 5000].forEach(scrollTo);
    expect(button()).toHaveAttribute('aria-hidden', 'true');
    expect(button()).toHaveAttribute('tabindex', '-1');
  });

  it('appears when heading back up from deep in the page, and fades after a few seconds', () => {
    render(<ScrollToTopButton />);
    scrollTo(5000);
    scrollTo(4800);
    expect(button()).toHaveAttribute('aria-hidden', 'false');
    act(() => {
      vi.advanceTimersByTime(HIDE_AFTER_MS + 50);
    });
    expect(button()).toHaveAttribute('aria-hidden', 'true');
  });

  it('hides again when scrolling back down, and at the top', () => {
    render(<ScrollToTopButton />);
    scrollTo(5000);
    scrollTo(4800);
    scrollTo(4900);
    expect(button()).toHaveAttribute('aria-hidden', 'true');
    scrollTo(4700);
    expect(button()).toHaveAttribute('aria-hidden', 'false');
    scrollTo(50);
    expect(button()).toHaveAttribute('aria-hidden', 'true');
  });

  it('stays while the pointer is on it, then goes to the top when pressed', () => {
    render(<ScrollToTopButton />);
    scrollTo(5000);
    scrollTo(4800);
    fireEvent.mouseEnter(button());
    act(() => {
      vi.advanceTimersByTime(HIDE_AFTER_MS * 3);
    });
    expect(button()).toHaveAttribute('aria-hidden', 'false');
    fireEvent.click(button());
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(button()).toHaveAttribute('aria-hidden', 'true');
  });

  it('adds up slow scrolling in small steps instead of resetting each time', () => {
    render(<ScrollToTopButton />);
    scrollTo(5000);
    // Four steps of 2px: each is under the jitter limit, together they are 8px up.
    [4998, 4996, 4994, 4992].forEach(scrollTo);
    expect(button()).toHaveAttribute('aria-hidden', 'false');
  });

  it('keyboard focus keeps it open even after the pointer leaves', () => {
    render(<ScrollToTopButton />);
    scrollTo(5000);
    scrollTo(4800);
    fireEvent.focus(button());
    fireEvent.mouseEnter(button());
    fireEvent.mouseLeave(button());
    act(() => {
      vi.advanceTimersByTime(HIDE_AFTER_MS * 3);
    });
    expect(button()).toHaveAttribute('aria-hidden', 'false');
    fireEvent.blur(button());
    act(() => {
      vi.advanceTimersByTime(HIDE_AFTER_MS + 50);
    });
    expect(button()).toHaveAttribute('aria-hidden', 'true');
  });
});
