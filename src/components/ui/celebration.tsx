import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createFireworks, TIER_DURATION, type CelebrationConfig, type CelebrationTier } from '@/lib/celebration-engine';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

// ============================================================
// Context
// ============================================================

interface CelebrationContextValue {
  celebrate: (config: CelebrationConfig) => void;
  /** User preference: reduce celebration motion */
  reducedCelebration: boolean;
  setReducedCelebration: (v: boolean) => void;
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

export function useCelebration() {
  const ctx = useContext(CelebrationContext);
  if (!ctx) throw new Error('useCelebration must be used within CelebrationProvider');
  return ctx;
}

// ============================================================
// Provider + Overlay
// ============================================================

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<CelebrationConfig | null>(null);
  const [reducedCelebration, setReducedCelebration] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      localStorage.getItem('unicorn-reduced-celebration') === 'true' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist preference
  useEffect(() => {
    localStorage.setItem('unicorn-reduced-celebration', String(reducedCelebration));
  }, [reducedCelebration]);

  const dismiss = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActive(null);
  }, []);

  const celebrate = useCallback(
    (config: CelebrationConfig) => {
      if (reducedCelebration) {
        // Still show the banner text, just skip animation
        setActive(config);
        const dur = config.duration || TIER_DURATION[config.tier];
        timeoutRef.current = setTimeout(() => setActive(null), dur);
        return;
      }

      setActive(config);

      // Start fireworks after a tick so canvas is mounted
      requestAnimationFrame(() => {
        if (canvasRef.current) {
          const dur = config.duration || TIER_DURATION[config.tier];
          cleanupRef.current = createFireworks(canvasRef.current, config.tier, dur);
          timeoutRef.current = setTimeout(dismiss, dur + 500);
        }
      });
    },
    [reducedCelebration, dismiss],
  );

  // Cleanup on unmount
  useEffect(() => () => { cleanupRef.current?.(); if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return (
    <CelebrationContext.Provider value={{ celebrate, reducedCelebration, setReducedCelebration }}>
      {children}

      {/* Celebration overlay */}
      {active && (
        <CelebrationOverlay
          config={active}
          canvasRef={canvasRef}
          onDismiss={dismiss}
          reduced={reducedCelebration}
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
          className="absolute inset-0 bg-secondary/40 animate-in fade-in duration-300"
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
                <Button variant="ghost" size="sm" onClick={onDismiss}>
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
