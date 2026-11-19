import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/** The page has to be at least this many screens deep before going back to the top is worth offering. */
export const DEEP_SCREENS = 1.5;
/** Within this many pixels of the top it is never shown. */
const NEAR_TOP_PX = 200;
/** A change smaller than this is jitter (trackpad inertia), not a change of direction. */
const MIN_MOVE_PX = 6;
/** How long it stays after the last upward scroll. */
export const HIDE_AFTER_MS = 3000;

/** True when someone this deep into a page is heading upward, which is when a way back to the top helps. */
export function wantsBackToTop(y: number, previousY: number, viewportHeight: number): boolean {
  if (y < NEAR_TOP_PX || y < viewportHeight * DEEP_SCREENS) return false;
  return previousY - y >= MIN_MOVE_PX;
}

/**
 * A small "Back to top" pill, not a permanent floating button. It stays out of the way until you have gone deep into
 * a long page and start scrolling back up (the moment you want it), sits at the bottom centre clear of the Ask Viv
 * launcher and the pinned footer, and fades away a few seconds after you stop. Scrolling down, reaching the top, or
 * leaving it alone all hide it. It stays while the pointer or keyboard focus is on it.
 */
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  const lastY = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pointer and keyboard focus each hold it open on their own, so letting go of one does not drop the other.
  const pointerOn = useRef(false);
  const focusOn = useRef(false);
  const isHeld = () => pointerOn.current || focusOn.current;

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const armTimer = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(() => {
      if (!isHeld()) setVisible(false);
    }, HIDE_AFTER_MS);
  }, []);

  useEffect(() => {
    lastY.current = window.scrollY;
    // lastY is an anchor that only moves once the page has moved far enough, so slow scrolling in small steps still adds
    // up to a direction instead of every tiny event resetting the baseline.
    const onScroll = () => {
      const y = window.scrollY;
      const previous = lastY.current;
      if (y >= NEAR_TOP_PX && Math.abs(y - previous) < MIN_MOVE_PX) return;
      lastY.current = y;
      if (y < NEAR_TOP_PX) {
        clearTimer();
        setVisible(false);
      } else if (wantsBackToTop(y, previous, window.innerHeight)) {
        setVisible(true);
        armTimer();
      } else if (y - previous >= MIN_MOVE_PX && !isHeld()) {
        // Heading down again: out of the way.
        clearTimer();
        setVisible(false);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimer();
    };
  }, [armTimer]);

  const hold = (source: "pointer" | "focus") => {
    (source === "pointer" ? pointerOn : focusOn).current = true;
    clearTimer();
  };
  const release = (source: "pointer" | "focus") => {
    (source === "pointer" ? pointerOn : focusOn).current = false;
    if (visible && !isHeld()) armTimer();
  };

  const goTop = () => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    setVisible(false);
  };

  return (
    <button
      type="button"
      onClick={goTop}
      onMouseEnter={() => hold("pointer")}
      onMouseLeave={() => release("pointer")}
      onFocus={() => hold("focus")}
      onBlur={() => release("focus")}
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={cn(
        "fixed bottom-10 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-card/95 px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-lg backdrop-blur",
        "transition-[opacity,transform] duration-200 motion-reduce:transition-none hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ArrowUp className="h-3.5 w-3.5" aria-hidden />
      Back to top
    </button>
  );
}
