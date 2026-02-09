import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Development-only hook that detects page-level horizontal overflow
 * and modal overflow issues. Logs warnings with route, role, and measurements.
 * 
 * This hook does NOTHING in production.
 * 
 * Usage:
 * Place this in your root layout component:
 * ```tsx
 * useDevOverflowWarning();
 * ```
 * 
 * Enable verbose logging:
 * ```tsx
 * localStorage.setItem('QA_VERBOSE', 'true')
 * ```
 */
export function useDevOverflowWarning() {
  const location = useLocation();
  const lastWarningRef = useRef<string | null>(null);

  const isVerbose = useCallback(() => {
    try {
      return localStorage.getItem('QA_VERBOSE') === 'true';
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    // Only run in development mode
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    const getUserRole = (): string => {
      try {
        // Try to get role from localStorage or session
        const profile = localStorage.getItem('sb-auth-token');
        if (profile) {
          const parsed = JSON.parse(profile);
          return parsed?.user?.user_metadata?.unicorn_role || 'Unknown';
        }
      } catch {
        // Ignore errors
      }
      return 'Unknown';
    };

    const checkOverflow = () => {
      const scrollWidth = document.body.scrollWidth;
      const innerWidth = window.innerWidth;
      const hasOverflow = scrollWidth > innerWidth;
      const role = getUserRole();

      const warningKey = `${location.pathname}-${scrollWidth}-${innerWidth}`;

      if (hasOverflow && lastWarningRef.current !== warningKey) {
        lastWarningRef.current = warningKey;
        
        console.warn(
          `%c[UI Overflow Warning]%c Horizontal overflow detected\n` +
          `  Route: %c${location.pathname}%c\n` +
          `  Role: ${role}\n` +
          `  Viewport: ${innerWidth}px\n` +
          `  scrollWidth: ${scrollWidth}px\n` +
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

    const checkModalOverflow = () => {
      // Check for modals/dialogs exceeding 85vh without scrolling
      const modals = document.querySelectorAll('[role="dialog"], [data-state="open"]');
      const maxHeight = window.innerHeight * 0.85;
      const role = getUserRole();

      modals.forEach((modal) => {
        const rect = modal.getBoundingClientRect();
        const hasInternalScroll = modal.scrollHeight > modal.clientHeight;
        
        if (rect.height > maxHeight && !hasInternalScroll) {
          if (isVerbose()) {
            console.warn(
              `%c[UI Modal Warning]%c Modal exceeds 85vh without internal scroll\n` +
              `  Route: %c${location.pathname}%c\n` +
              `  Role: ${role}\n` +
              `  Modal height: ${Math.round(rect.height)}px\n` +
              `  Max allowed: ${Math.round(maxHeight)}px\n` +
              `  Viewport: ${window.innerWidth}px × ${window.innerHeight}px\n\n` +
              `  Fix: Add overflow-y-auto to modal body or reduce content.`,
              'background: #ffa94d; color: white; padding: 2px 6px; border-radius: 3px;',
              'color: inherit;',
              'color: #4dabf7; font-weight: bold;',
              'color: inherit;'
            );
          }
        }
      });
    };

    const checkTouchTargets = () => {
      if (!isVerbose()) return;

      const interactiveElements = document.querySelectorAll(
        'button, a, input, select, textarea, [role="button"], [role="link"]'
      );
      
      interactiveElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if ((rect.width > 0 && rect.width < 44) || (rect.height > 0 && rect.height < 44)) {
          // Only warn for visible elements
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            console.debug(
              `[Touch Target Warning] Element smaller than 44px:`,
              {
                element: el,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                route: location.pathname,
              }
            );
          }
        }
      });
    };

    // Run all checks
    const runAllChecks = () => {
      checkOverflow();
      checkModalOverflow();
      checkTouchTargets();
    };

    // Check immediately
    runAllChecks();

    // Check on resize
    window.addEventListener('resize', runAllChecks);

    // Check on DOM changes (with debounce)
    let debounceTimeout: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(runAllChecks, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-state'],
    });

    return () => {
      window.removeEventListener('resize', runAllChecks);
      observer.disconnect();
      clearTimeout(debounceTimeout);
    };
  }, [location.pathname, isVerbose]);
}

/**
 * Check if the current page has horizontal overflow.
 * Returns details about overflow state.
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

/**
 * Check if any open modals exceed viewport without scrolling.
 * Returns array of problematic modal elements.
 */
export function checkModalOverflow(): Array<{
  element: Element;
  height: number;
  maxAllowed: number;
  hasScroll: boolean;
}> {
  const modals = document.querySelectorAll('[role="dialog"], [data-state="open"]');
  const maxHeight = window.innerHeight * 0.85;
  const issues: Array<{
    element: Element;
    height: number;
    maxAllowed: number;
    hasScroll: boolean;
  }> = [];

  modals.forEach((modal) => {
    const rect = modal.getBoundingClientRect();
    const hasInternalScroll = modal.scrollHeight > modal.clientHeight;
    
    if (rect.height > maxHeight && !hasInternalScroll) {
      issues.push({
        element: modal,
        height: rect.height,
        maxAllowed: maxHeight,
        hasScroll: hasInternalScroll,
      });
    }
  });

  return issues;
}
