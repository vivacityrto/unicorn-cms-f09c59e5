import { useCallback } from "react";
import { toast } from "sonner";
import { useClientPreview } from "@/contexts/ClientPreviewContext";

/**
 * Centralised guard for write actions while a Vivacity staff member is
 * impersonating a client tenant ("Read-only preview mode"). Use at the top
 * of every mutation/write callback on client-facing surfaces.
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

  const blockWrite = useCallback(
    (_actionLabel?: string): boolean => {
      if (!isPreviewMode) return false;
      toast("Actions are disabled in preview mode.");
      return true;
    },
    [isPreviewMode]
  );

  return { isReadOnly: isPreviewMode, blockWrite };
}

/** Sentinel thrown by guarded mutationFns so onError can swallow without re-toasting. */
export const PREVIEW_BLOCKED_ERROR = "__PREVIEW_BLOCKED__";

export function isPreviewBlockedError(err: unknown): boolean {
  return err instanceof Error && err.message === PREVIEW_BLOCKED_ERROR;
}
