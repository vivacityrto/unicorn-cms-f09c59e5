import { useCallback } from "react";
import { toast } from "sonner";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import { useAcademyActingUserId } from "@/hooks/academy/useAcademyActingUserId";

/**
 * Centralised guard for write actions while a Vivacity staff member is
 * previewing as a client. Two preview flavours exist:
 *   - Client Portal preview      → read-only, writes blocked
 *   - Academy impersonation      → write-capable, routes via *_as_impersonator RPCs
 *
 * Usage:
 *   const { isReadOnly, blockWrite } = useReadOnlyGuard();
 *   if (blockWrite()) return; // shows toast + aborts
 *
 * For silent skips (e.g. background auto-progress upserts) read `isReadOnly`
 * directly and bail without surfacing a toast.
 */
export function useReadOnlyGuard() {
  const { isPreviewMode } = useClientPreview();
  const { isImpersonating } = useAcademyActingUserId();

  // Academy impersonation is a write-capable preview. Only the Client Portal
  // preview branch (preview ON, impersonation OFF) is treated as read-only.
  const isReadOnly = isPreviewMode && !isImpersonating;

  // NOTE: The toast wording below ("Actions are disabled in preview mode.")
  // assumes only the Client Portal preview branch can reach it. Academy
  // impersonation bypasses via the `&& !isImpersonating` clause above, so this
  // toast must never fire for Academy mutations. If the predicate is ever
  // inverted or the bypass removed, the wording will be wrong for Academy.

  const blockWrite = useCallback(
    (_actionLabel?: string): boolean => {
      if (!isReadOnly) return false;
      toast("Actions are disabled in preview mode.");
      return true;
    },
    [isReadOnly]
  );

  return { isReadOnly, blockWrite };
}

/** Sentinel thrown by guarded mutationFns so onError can swallow without re-toasting. */
export const PREVIEW_BLOCKED_ERROR = "__PREVIEW_BLOCKED__";

export function isPreviewBlockedError(err: unknown): boolean {
  return err instanceof Error && err.message === PREVIEW_BLOCKED_ERROR;
}
