import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ScrollableTableWrapperProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps a table in a relative-positioned container and shows a subtle edge
 * fade whenever there's more content to scroll to, so a cut-off column
 * doesn't read as a dead end.
 *
 * The fade overlays live in a non-scrolling outer container so they stay
 * pinned to the visible edges rather than scrolling away with the content.
 *
 * Some tables (e.g. the shared `Table` primitive) already render their own
 * horizontally-scrolling wrapper one level deeper than this component - in
 * that case the inner container itself never overflows, so the fade tracks
 * that nested `.overflow-x-auto` element instead of adding a redundant
 * scroll box. For tables with no such descendant, pass `overflow-x-auto` in
 * `className` to make the inner container the scroll box directly.
 */
export function ScrollableTableWrapper({ children, className }: ScrollableTableWrapperProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [showLeftShadow, setShowLeftShadow] = useState(false);
  const [showRightShadow, setShowRightShadow] = useState(false);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    // Always prefer a nested `.overflow-x-auto` descendant when one exists -
    // checking inner's own scrollWidth first breaks detection whenever inner
    // itself is a non-scrolling positioning box (e.g. `overflow-hidden` for
    // rounded corners), since scrollWidth reflects the full content width
    // regardless of inner's own overflow CSS, so that check can be true even
    // though inner can never actually be scrolled.
    const scrollEl = inner.querySelector<HTMLElement>(".overflow-x-auto") ?? inner;

    const updateShadows = () => {
      setShowLeftShadow(scrollEl.scrollLeft > 0);
      setShowRightShadow(scrollEl.scrollLeft + scrollEl.clientWidth < scrollEl.scrollWidth - 1);
    };

    updateShadows();
    scrollEl.addEventListener("scroll", updateShadows);
    const resizeObserver = new ResizeObserver(updateShadows);
    resizeObserver.observe(scrollEl);

    return () => {
      scrollEl.removeEventListener("scroll", updateShadows);
      resizeObserver.disconnect();
    };
  }, [children]);

  return (
    <div className="relative">
      <div ref={innerRef} className={className}>
        {children}
      </div>
      {showLeftShadow && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black/10 dark:from-white/10 to-transparent" />
      )}
      {showRightShadow && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black/10 dark:from-white/10 to-transparent" />
      )}
    </div>
  );
}
