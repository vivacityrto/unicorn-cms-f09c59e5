/**
 * Network Status Indicator Component
 * 
 * Displays toast notifications when network status changes
 * and optionally shows a persistent banner when offline.
 * 
 * Usage:
 * ```typescript
 * // In AuthenticatedLayout or App.tsx
 * <NetworkStatusIndicator />
 * 
 * // With persistent banner
 * <NetworkStatusIndicator showBanner />
 * ```
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { useNetworkStatus, ConnectionQuality } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';

interface NetworkStatusIndicatorProps {
  /** Show a persistent banner when offline (default: false) */
  showBanner?: boolean;
  /** Custom class for the banner */
  className?: string;
}

/**
 * Format seconds into a human-readable duration.
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * Network status indicator that shows toasts on status changes.
 */
export function NetworkStatusIndicator({
  showBanner = false,
  className,
}: NetworkStatusIndicatorProps) {
  const { isOnline, connectionQuality, secondsOffline } = useNetworkStatus();
  const previousStatus = useRef<{ online: boolean; quality: ConnectionQuality }>({
    online: true,
    quality: 'good',
  });
  const hasShownInitialToast = useRef(false);

  useEffect(() => {
    // Skip initial render toast
    if (!hasShownInitialToast.current) {
      hasShownInitialToast.current = true;
      previousStatus.current = { online: isOnline, quality: connectionQuality };
      return;
    }

    const prev = previousStatus.current;

    // Went offline
    if (prev.online && !isOnline) {
      toast.error('You are offline', {
        description: 'Some features may not be available until you reconnect.',
        icon: <WifiOff className="h-4 w-4" />,
        duration: 5000,
      });
    }

    // Came back online
    if (!prev.online && isOnline) {
      toast.success('Back online', {
        description: 'Your connection has been restored.',
        icon: <Wifi className="h-4 w-4" />,
        duration: 3000,
      });
    }

    // Connection quality degraded
    if (
      prev.online &&
      isOnline &&
      prev.quality === 'good' &&
      connectionQuality === 'slow'
    ) {
      toast.warning('Slow connection detected', {
        description: 'Some operations may take longer than usual.',
        icon: <AlertTriangle className="h-4 w-4" />,
        duration: 4000,
      });
    }

    // Connection quality improved
    if (
      prev.online &&
      isOnline &&
      prev.quality === 'slow' &&
      connectionQuality === 'good'
    ) {
      toast.success('Connection improved', {
        icon: <Wifi className="h-4 w-4" />,
        duration: 2000,
      });
    }

    previousStatus.current = { online: isOnline, quality: connectionQuality };
  }, [isOnline, connectionQuality]);

  // Don't render banner if online or banner not requested
  if (!showBanner || isOnline) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground',
        'px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium',
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      <WifiOff className="h-4 w-4" />
      <span>
        You are currently offline
        {secondsOffline !== null && secondsOffline > 10 && (
          <span className="text-destructive-foreground/80">
            {' '}
            ({formatDuration(secondsOffline)})
          </span>
        )}
      </span>
    </div>
  );
}

export default NetworkStatusIndicator;
