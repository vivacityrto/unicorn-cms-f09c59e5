import { useState, useEffect, useCallback } from 'react';
import type { AddinSession, AddinUser, AddinFeatures } from '@/lib/addin/types';

const ADDIN_TOKEN_KEY = 'unicorn_addin_token';
const ADDIN_SESSION_KEY = 'unicorn_addin_session';

interface UseAddinSessionResult {
  session: AddinSession | null;
  user: AddinUser | null;
  features: AddinFeatures | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isExpired: boolean;
  setSession: (session: AddinSession) => void;
  clearSession: () => void;
  refreshSession: () => Promise<void>;
}

export function useAddinSession(): UseAddinSessionResult {
  const [session, setSessionState] = useState<AddinSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load session from storage on mount
  useEffect(() => {
    try {
      const storedSession = sessionStorage.getItem(ADDIN_SESSION_KEY);
      if (storedSession) {
        const parsed = JSON.parse(storedSession);
        // Convert expiresAt string back to Date
        parsed.expiresAt = new Date(parsed.expiresAt);
        setSessionState(parsed);
      }
    } catch (error) {
      console.error('[useAddinSession] Failed to load session:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setSession = useCallback((newSession: AddinSession) => {
    setSessionState(newSession);
    sessionStorage.setItem(ADDIN_SESSION_KEY, JSON.stringify(newSession));
    sessionStorage.setItem(ADDIN_TOKEN_KEY, newSession.token);
  }, []);

  const clearSession = useCallback(() => {
    setSessionState(null);
    sessionStorage.removeItem(ADDIN_SESSION_KEY);
    sessionStorage.removeItem(ADDIN_TOKEN_KEY);
  }, []);

  const refreshSession = useCallback(async () => {
    // Placeholder for session refresh logic
    // This would call the exchange endpoint again with a new MS token
    console.log('[useAddinSession] Session refresh not yet implemented');
  }, []);

  const isExpired = session ? new Date() > session.expiresAt : false;
  const isAuthenticated = session !== null && !isExpired;

  return {
    session,
    user: session?.user ?? null,
    features: session?.features ?? null,
    isLoading,
    isAuthenticated,
    isExpired,
    setSession,
    clearSession,
    refreshSession,
  };
}

/**
 * Get the current add-in token from storage
 * Useful for making API calls
 */
export function getAddinToken(): string | null {
  return sessionStorage.getItem(ADDIN_TOKEN_KEY);
}
