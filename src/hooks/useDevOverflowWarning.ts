import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Development-only hook that detects page-level horizontal overflow.
 * Logs a warning with route name and measured widths.
 * 
 * This hook does NOTHING in production.
 * 
 * Usage:
 * Place this in your root layout component:
 * ```tsx
 * useDevOverflowWarning();
 * ```
 */
export function useDevOverflowWarning() {
  const location = useLocation();
  const lastWarningRef = useRef<string | null>(null);

  useEffect(() => {
    // Only run in development mode
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const checkOverflow = () => {
      const scrollWidth = document.body.scrollWidth;
      const innerWidth = window.innerWidth;
      const hasOverflow = scrollWidth > innerWidth;

      const warningKey = `${location.pathname}-${scrollWidth}-${innerWidth}`;

      if (hasOverflow && lastWarningRef.current !== warningKey) {
        lastWarningRef.current = warningKey;
        
        console.warn(
          `%c[UI Overflow Warning]%c Horizontal overflow detected on %c${location.pathname}%c\n` +
          `  scrollWidth: ${scrollWidth}px\n` +
          `  innerWidth: ${innerWidth}px\n` +
          `  overflow: ${scrollWidth - innerWidth}px\n\n` +
          `  Fix: Check for fixed-width elements or missing overflow containment.\n` +
          `  Run QA Harness: /admin/qa/responsive`,
          'background: #ff6b6b; color: white; padding: 2px 6px; border-radius: 3px;',
          'color: inherit;',
          'color: #4dabf7; font-weight: bold;',
          'color: inherit;'
        );
      } else if (!hasOverflow) {
        // Clear warning when overflow is fixed
        lastWarningRef.current = null;
      }
    };

    // Check immediately
    checkOverflow();

    // Check on resize
    window.addEventListener('resize', checkOverflow);

    // Check on DOM changes (with debounce)
    let debounceTimeout: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(checkOverflow, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    return () => {
      window.removeEventListener('resize', checkOverflow);
      observer.disconnect();
      clearTimeout(debounceTimeout);
    };
  }, [location.pathname]);
}

/**
 * Check if the current page has horizontal overflow.
 * Returns null if no overflow, or details if overflow exists.
 * 
 * Can be used for conditional rendering of warnings.
 */
export function checkPageOverflow(): { 
  hasOverflow: boolean; 
  scrollWidth: number; 
  innerWidth: number; 
  overflow: number;
} {
  const scrollWidth = document.body.scrollWidth;
  const innerWidth = window.innerWidth;
  const overflow = scrollWidth - innerWidth;
  
  return {
    hasOverflow: overflow > 0,
    scrollWidth,
    innerWidth,
    overflow,
  };
}
