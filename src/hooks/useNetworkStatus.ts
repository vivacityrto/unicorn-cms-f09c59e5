/**
 * Network Status Hook for Unicorn 2.0
 * 
 * Provides reactive network status information:
 * - Online/offline detection
 * - Last online timestamp
 * - Connection quality estimation
 * 
 * Usage:
 * ```typescript
 * import { useNetworkStatus } from '@/hooks/useNetworkStatus';
 * 
 * function MyComponent() {
 *   const { isOnline, connectionQuality, lastOnline } = useNetworkStatus();
 *   
 *   if (!isOnline) {
 *     return <OfflineBanner />;
 *   }
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type ConnectionQuality = 'good' | 'slow' | 'offline';

interface NetworkStatus {
  /** Whether the browser reports being online */
  isOnline: boolean;
  /** Estimated connection quality based on Network Information API */
  connectionQuality: ConnectionQuality;
  /** Timestamp of the last time the connection was online */
  lastOnline: Date | null;
  /** Time in seconds since last online (null if currently online) */
  secondsOffline: number | null;
}

/**
 * Determine connection quality from Network Information API.
 */
function getConnectionQuality(): ConnectionQuality {
  if (!navigator.onLine) return 'offline';

  // Use Network Information API if available
  const connection = (navigator as Navigator & { 
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
    };
  }).connection;

  if (connection) {
    // Check effective connection type
    const effectiveType = connection.effectiveType;
    if (effectiveType === '2g' || effectiveType === 'slow-2g') {
      return 'slow';
    }

    // Check round-trip time (>500ms is slow)
    if (connection.rtt && connection.rtt > 500) {
      return 'slow';
    }

    // Check downlink speed (<1 Mbps is slow)
    if (connection.downlink && connection.downlink < 1) {
      return 'slow';
    }
  }

  return 'good';
}

/**
 * Hook for monitoring network status.
 * 
 * @returns Current network status information
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(
    typeof navigator !== 'undefined' ? getConnectionQuality() : 'good'
  );
  const [lastOnline, setLastOnline] = useState<Date | null>(
    typeof navigator !== 'undefined' && navigator.onLine ? new Date() : null
  );
  const [secondsOffline, setSecondsOffline] = useState<number | null>(null);

  const offlineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setLastOnline(new Date());
    setSecondsOffline(null);
    setConnectionQuality(getConnectionQuality());

    // Clear offline timer
    if (offlineTimerRef.current) {
      clearInterval(offlineTimerRef.current);
      offlineTimerRef.current = null;
    }
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setConnectionQuality('offline');

    // Start tracking time offline
    const startTime = Date.now();
    offlineTimerRef.current = setInterval(() => {
      setSecondsOffline(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  }, []);

  const handleConnectionChange = useCallback(() => {
    if (navigator.onLine) {
      setConnectionQuality(getConnectionQuality());
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Add online/offline listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Add connection change listener if available
    const connection = (navigator as Navigator & { 
      connection?: EventTarget;
    }).connection;

    if (connection) {
      connection.addEventListener('change', handleConnectionChange);
    }

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      if (connection) {
        connection.removeEventListener('change', handleConnectionChange);
      }

      if (offlineTimerRef.current) {
        clearInterval(offlineTimerRef.current);
      }
    };
  }, [handleOnline, handleOffline, handleConnectionChange]);

  return {
    isOnline,
    connectionQuality,
    lastOnline,
    secondsOffline,
  };
}

export default useNetworkStatus;
