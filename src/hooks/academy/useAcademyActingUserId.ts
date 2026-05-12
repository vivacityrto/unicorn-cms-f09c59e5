import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { useAuth } from "@/hooks/useAuth";
import { useUserAccess } from "@/hooks/useUserAccess";

export interface AcademyActingUser {
  /** The user_uuid whose data is being read/written. Null if not resolved. */
  userId: string | null;
  /** True when an impersonation session is active and an acting user is resolved. */
  isImpersonating: boolean;
  /** True if the calling auth user is Vivacity staff. */
  isStaff: boolean;
  /** True while acting-user resolution is still in flight. */
  isLoading: boolean;
}

/**
 * Single source of truth for which user_uuid Academy hooks should read/write
 * against. Returns the acting user (when staff is impersonating) or the
 * authed user, otherwise null.
 */
export function useAcademyActingUserId(): AcademyActingUser {
  const { actingUserId, isPreviewMode, loading: previewLoading } = useClientPreview();
  const { user, loading: authLoading } = useAuth();
  const { isVivacityStaff, isLoading: accessLoading } = useUserAccess();

  const isImpersonating = isPreviewMode && !!actingUserId;
  // In preview mode, NEVER fall back to the authed staff user — that would
  // cause academy reads/writes to run as the SuperAdmin while previewing a
  // tenant. If preview has no valid acting user, return null so consumers
  // render an empty state and queries no-op.
  const userId = isPreviewMode ? actingUserId : user?.id ?? null;

  return {
    userId,
    isImpersonating,
    isStaff: isVivacityStaff,
    isLoading: authLoading || accessLoading || previewLoading,
  };
}
