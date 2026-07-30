import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Generic "how many tabs fit before we need a 'More' overflow dropdown"
 * calculator — the width-measurement + ResizeObserver pattern Client
 * Detail's tab strip (src/pages/ClientDetail.tsx) uses, extracted so other
 * tab-heavy pages don't each reimplement it (or reach for horizontal
 * scroll, which is explicitly not the sanctioned pattern for tab overflow
 * in this app — see feedback_no_tab_scroll memory).
 *
 * As many tabs as fit render directly; the rest collapse into a "More"
 * trigger whose own label swaps to the active tab's label+icon when that
 * tab is one of the overflowed ones (so the active tab is never hidden
 * behind an anonymous "More").
 *
 * Usage — render three things:
 * 1. The real, visible tabs: `items.slice(0, visibleCount)`.
 * 2. If `items.slice(visibleCount)` is non-empty, a "More" trigger +
 *    dropdown for the rest, using `moreButtonRef` for its own DOM node.
 * 3. A hidden (aria-hidden, absolute, zero-height) measurement row with:
 *    - one clone of each item's real markup, ref'd via `itemRef(i)`
 *    - one clone of the plain "More" trigger's markup, ref'd via `moreMeasureRef`
 *    - one clone per item of what the trigger looks like when swapped to
 *      show that item active, ref'd via `activeMoreMeasureRef(i)`
 *
 * The hook only computes `visibleCount`; it never touches rendering or
 * tab-switching logic itself.
 */
export function useOverflowTabs(itemCount: number, gap = 16) {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const itemMeasureRefs = useRef<(HTMLElement | null)[]>([]);
  const moreMeasureRef = useRef<HTMLElement | null>(null);
  const activeMoreMeasureRefs = useRef<(HTMLElement | null)[]>([]);
  const [visibleCount, setVisibleCount] = useState(itemCount);

  useLayoutEffect(() => {
    if (!containerEl) return;

    const recompute = () => {
      const containerWidth = containerEl.clientWidth;
      const widths = itemMeasureRefs.current.slice(0, itemCount).map((el) => el?.offsetWidth ?? 0);

      // The "More" trigger isn't always the plain "More" label — when the
      // active item is one of the overflow ones, it swaps in that item's
      // own icon+label instead, which can be wider. Reserve whichever is
      // widest so the budget never comes up short.
      const moreWidth = Math.max(
        moreMeasureRef.current?.offsetWidth ?? 90,
        ...activeMoreMeasureRefs.current.slice(0, itemCount).map((el) => el?.offsetWidth ?? 0),
      );

      // If every item fits on its own, show them all — no need to reserve
      // room for "More" at all.
      const fullTotal = widths.reduce((sum, w, i) => sum + w + (i > 0 ? gap : 0), 0);
      if (fullTotal <= containerWidth) {
        setVisibleCount(widths.length);
        return;
      }

      let total = 0;
      let count = 0;
      for (let i = 0; i < widths.length; i++) {
        const withThis = total + widths[i] + (i > 0 ? gap : 0);
        if (withThis + gap + moreWidth <= containerWidth) {
          total = withThis;
          count = i + 1;
        } else {
          break;
        }
      }
      setVisibleCount(count);
    };

    recompute();
    const resizeObserver = new ResizeObserver(recompute);
    resizeObserver.observe(containerEl);
    return () => resizeObserver.disconnect();
  }, [containerEl, itemCount, gap]);

  return {
    containerRef: setContainerEl,
    itemRef: (index: number) => (el: HTMLElement | null) => { itemMeasureRefs.current[index] = el; },
    moreMeasureRef,
    activeMoreMeasureRef: (index: number) => (el: HTMLElement | null) => { activeMoreMeasureRefs.current[index] = el; },
    visibleCount,
  };
}
