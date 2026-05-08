import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useUserAccess } from "@/hooks/useUserAccess";

const FALLBACK_MS = 5000;

/**
 * Mounted at /post-sign-in. Reads useUserAccess and routes the caller
 * to the correct landing page. Falls back to /academy if access flags
 * fail to resolve within 5s — Academy is the safest default.
 *
 * Toast for the "no tenant rows" case fires only on FRESH sign-in
 * (location.state.fresh === true), suppressed for returning sessions.
 */
export default function PostSignInRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const flags = useUserAccess();
  const [timedOut, setTimedOut] = useState(false);

  const fresh =
    (location.state as { fresh?: boolean } | null)?.fresh === true ||
    new URLSearchParams(location.search).get("fresh") === "1";

  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (timedOut && (flags.isLoading || flags.error)) {
      toast.warning(
        "Could not verify your access — landing on Academy by default. Refresh to retry."
      );
      navigate("/academy", { replace: true });
      return;
    }

    if (flags.isLoading) return;

    if (flags.isVivacityStaff) {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (flags.hasFullAccess) {
      navigate("/client/home", { replace: true });
      return;
    }
    if (flags.hasAcademyOnly) {
      navigate("/academy", { replace: true });
      return;
    }
    // No tenant rows
    if (fresh) {
      toast.warning(
        "Academy access only — contact support if you expected more."
      );
    }
    navigate("/academy", { replace: true });
  }, [
    flags.isLoading,
    flags.error,
    flags.isVivacityStaff,
    flags.hasFullAccess,
    flags.hasAcademyOnly,
    flags.hasAnyTenant,
    fresh,
    timedOut,
    navigate,
  ]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}
