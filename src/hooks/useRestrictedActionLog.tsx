import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Permission } from '@/hooks/useRBAC';

interface LogAttemptParams {
  permission: Permission;
  action: string;
  userRole: string;
}

/**
 * Hook to log when users attempt restricted actions.
 * Used for analytics to identify permission friction hotspots.
 * 
 * Debounced to prevent spam logging on repeated clicks.
 */
export function useRestrictedActionLog() {
  const { user, profile } = useAuth();
  const lastLogRef = useRef<{ key: string; time: number } | null>(null);

  const logAttempt = useCallback(async ({ permission, action, userRole }: LogAttemptParams) => {
    if (!user?.id || !profile) return;

    // Debounce: don't log same action within 5 seconds
    const key = `${permission}:${action}`;
    const now = Date.now();
    if (lastLogRef.current && lastLogRef.current.key === key && now - lastLogRef.current.time < 5000) {
      return;
    }
    lastLogRef.current = { key, time: now };

    try {
      // Get current page path
      const pagePath = window.location.pathname;

      await supabase.from('audit_restricted_actions').insert({
        user_id: user.id,
        tenant_id: profile.tenant_id,
        action_attempted: action,
        permission_required: permission,
        user_role: userRole,
        page_path: pagePath,
      });
    } catch (error) {
      // Silently fail - this is analytics, not critical functionality
      console.debug('Failed to log restricted action attempt:', error);
    }
  }, [user?.id, profile]);

  return { logAttempt };
}
