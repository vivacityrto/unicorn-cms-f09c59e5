import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createFireworks, TIER_DURATION, type CelebrationConfig, type CelebrationTier } from '@/lib/celebration-engine';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useUIPrefs } from '@/hooks/use-ui-prefs';

// ============================================================
// Context
// ============================================================

interface CelebrationContextValue {
  /** Trigger a celebration. Only call after server-confirmed success. */
  trigger: (config: CelebrationConfig) => void;
  dismiss: () => void;
  isShowing: boolean;
  currentEvent: CelebrationConfig | null;
  /** User preference: reduce celebration motion */
  reducedCelebration: boolean;
  setReducedCelebration: (v: boolean) => void;
  /** @deprecated Use trigger() instead */
  celebrate: (config: CelebrationConfig) => void;
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

export function useCelebration() {
  const ctx = useContext(CelebrationContext);
  if (!ctx) throw new Error('useCelebration must be used within CelebrationProvider');
  return ctx;
}

// ============================================================
// Dedup key
// ============================================================

function dedupKey(config: CelebrationConfig): string {
  // Use tier + message as dedup key (message encodes event_type context)
  return `${config.tier}:${config.message || ''}`;
}

// ============================================================
// Provider + Overlay
// ============================================================

const COOLDOWN_MS = 5000;
const DEDUP_WINDOW_MS = 10000;

/** Whether current route is client portal */
function isClientPortal() {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/client');
}

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const { prefs } = useUIPrefs();
  const [active, setActive] = useState<CelebrationConfig | null>(null);
  const queueRef = useRef<CelebrationConfig[]>([]);
  const lastDismissRef = useRef<number>(0);
  const recentEventsRef = useRef<Map<string, number>>(new Map());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // OS prefers-reduced-motion is an absolute override
  const osReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const effectiveReducedMotion = prefs.reduce_motion || osReducedMotion;
  const canAnimate = prefs.celebrations_enabled && !effectiveReducedMotion;
  const celebrationsEnabled = prefs.celebrations_enabled;

  // Clean old dedup entries periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      recentEventsRef.current.forEach((ts, key) => {
        if (now - ts > DEDUP_WINDOW_MS) recentEventsRef.current.delete(key);
      });
    }, DEDUP_WINDOW_MS);
    return () => clearInterval(interval);
  }, []);

  const dismiss = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActive(null);
    lastDismissRef.current = Date.now();

    // Process queue after cooldown
    setTimeout(() => {
      if (queueRef.current.length > 0) {
        const next = queueRef.current.shift()!;
        showCelebration(next);
      }
    }, COOLDOWN_MS);
  }, []);

  const showCelebration = useCallback(
    (config: CelebrationConfig) => {
      // Tier 3 blocked in client portal
      if (config.tier === 'enterprise' && isClientPortal()) {
        config = { ...config, tier: 'milestone' };
      }

      setActive(config);

      if (canAnimate) {
        requestAnimationFrame(() => {
          if (canvasRef.current) {
            const dur = config.duration || TIER_DURATION[config.tier];
            cleanupRef.current = createFireworks(canvasRef.current, config.tier, dur);
            timeoutRef.current = setTimeout(dismiss, dur + 500);
          }
        });
      } else {
        // Reduced motion: show banner only, no fireworks
        const dur = config.duration || TIER_DURATION[config.tier];
        timeoutRef.current = setTimeout(dismiss, dur);
      }
    },
    [canAnimate, dismiss],
  );

  const trigger = useCallback(
    (config: CelebrationConfig) => {
      if (!celebrationsEnabled) return;

      // Dedup check
      const key = dedupKey(config);
      const now = Date.now();
      const lastSeen = recentEventsRef.current.get(key);
      if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return;
      recentEventsRef.current.set(key, now);

      // If something is showing, queue
      if (active) {
        queueRef.current.push(config);
        return;
      }

      // Cooldown check
      if (now - lastDismissRef.current < COOLDOWN_MS) {
        queueRef.current.push(config);
        return;
      }

      showCelebration(config);
    },
    [celebrationsEnabled, active, showCelebration],
  );

  // Cleanup on unmount
  useEffect(() => () => {
    cleanupRef.current?.();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  // Esc to dismiss
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, dismiss]);

  return (
    <CelebrationContext.Provider
      value={{
        trigger,
        dismiss,
        isShowing: !!active,
        currentEvent: active,
        reducedCelebration: effectiveReducedMotion,
        setReducedCelebration: () => {},
        celebrate: trigger, // backward compat
      }}
    >
      {children}

      {/* Celebration overlay */}
      {active && (
        <CelebrationOverlay
          config={active}
          canvasRef={canvasRef}
          onDismiss={dismiss}
          reduced={!canAnimate}
        />
      )}
    </CelebrationContext.Provider>
  );
}

// ============================================================
// Overlay Component
// ============================================================

function CelebrationOverlay({
  config,
  canvasRef,
  onDismiss,
  reduced,
}: {
  config: CelebrationConfig;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onDismiss: () => void;
  reduced: boolean;
}) {
  const isFullOverlay = config.tier === 'milestone' || config.tier === 'enterprise';
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management: capture + restore
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    if (isFullOverlay) {
      closeButtonRef.current?.focus();
    }
    return () => {
      previousFocusRef.current?.focus();
    };
  }, [isFullOverlay]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] pointer-events-none',
        isFullOverlay && 'pointer-events-auto',
      )}
      role="status"
      aria-live="polite"
    >
      {/* Backdrop for milestone/enterprise */}
      {isFullOverlay && (
        <div
          className={cn(
            'absolute inset-0 bg-secondary/40 animate-in fade-in duration-300',
            !reduced && 'backdrop-blur-[3px]',
          )}
          onClick={onDismiss}
        />
      )}

      {/* Canvas for particles */}
      {!reduced && (
        <canvas
          ref={canvasRef}
          className={cn(
            'absolute',
            config.tier === 'spark'
              ? 'top-0 right-0 w-64 h-64'
              : 'inset-0 w-full h-full',
          )}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Message banner */}
      {config.message && (
        <div
          className={cn(
            'absolute flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500',
            config.tier === 'spark'
              ? 'top-6 right-6 text-right'
              : 'inset-0 justify-center text-center px-6',
          )}
        >
          <div className={cn(
            'rounded-2xl px-8 py-6 shadow-xl border pointer-events-auto',
            isFullOverlay
              ? 'bg-background/95 backdrop-blur-sm max-w-md w-full'
              : 'bg-background/95 backdrop-blur-sm',
            reduced && 'border-primary/30',
          )}>
            <h2 className={cn(
              'font-semibold text-secondary',
              config.tier === 'spark' ? 'text-lg' : 'text-xl',
            )}>
              {config.message}
            </h2>

            {config.subtitle && (
              <p className="mt-2 text-sm text-muted-foreground">{config.subtitle}</p>
            )}

            <div className="flex items-center justify-center gap-3 mt-4">
              {config.ctaLabel && config.ctaAction && (
                <Button onClick={() => { config.ctaAction?.(); onDismiss(); }}>
                  {config.ctaLabel}
                </Button>
              )}
              {isFullOverlay && (
                <Button
                  ref={closeButtonRef}
                  variant="ghost"
                  size="sm"
                  onClick={onDismiss}
                  aria-label="Dismiss celebration"
                >
                  <X className="h-4 w-4 mr-1" /> Dismiss
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
