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
 * Some tables (e.g. the shared `Table` primitive) already render their own
 * horizontally-scrolling wrapper one level deeper than this component - in
 * that case this container itself never overflows, so the fade tracks that
 * nested `.overflow-x-auto` element instead of adding a redundant scroll box.
 * For tables with no such descendant, pass `overflow-x-auto` in `className`
 * to make this container the scroll box directly.
 */
export function ScrollableTableWrapper({ children, className }: ScrollableTableWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftShadow, setShowLeftShadow] = useState(false);
  const [showRightShadow, setShowRightShadow] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollEl =
      container.scrollWidth > container.clientWidth
        ? container
        : (container.querySelector<HTMLElement>(".overflow-x-auto") ?? container);

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
    <div ref={containerRef} className={cn("relative", className)}>
      {children}
      {showLeftShadow && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black/10 dark:from-white/10 to-transparent" />
      )}
      {showRightShadow && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black/10 dark:from-white/10 to-transparent" />
      )}
    </div>
  );
}
