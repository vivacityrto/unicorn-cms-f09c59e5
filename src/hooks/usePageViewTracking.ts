import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const SESSION_STORAGE_KEY = "client_portal_page_view_session_id";

function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
}

/**
 * Logs every client-portal page view via rpc_log_page_view. Each call closes
 * out the previous page's duration in the same round-trip, so no throttling
 * or beforeunload handling is needed — route changes are naturally
 * infrequent (unlike continuous events like scroll/video progress).
 *
 * Known limitation: the last page of a browser session (closed tab, no
 * further navigation) never gets its duration closed out — an async RPC
 * call in a beforeunload handler isn't reliably delivered, so this is left
 * as an accepted gap rather than a false guarantee. The daily digest job
 * treats such rows as page views with unknown duration.
 */
export function usePageViewTracking(enabled: boolean) {
  const location = useLocation();
  const enteredAtRef = useRef<number>(Date.now());
  const isFirstPageRef = useRef(true);

  useEffect(() => {
    if (!enabled) return;

    const now = Date.now();
    const prevDurationSeconds = isFirstPageRef.current
      ? null
      : Math.max(Math.round((now - enteredAtRef.current) / 1000), 0);
    isFirstPageRef.current = false;
    enteredAtRef.current = now;

    supabase
      .rpc("rpc_log_page_view", {
        p_path: location.pathname,
        p_page_label: document.title || null,
        p_session_id: getOrCreateSessionId(),
        p_prev_duration_seconds: prevDurationSeconds,
      })
      .then(({ error }) => {
        if (error) console.error("usePageViewTracking: log failed", error);
      });
    // Only re-run on actual navigation; `enabled` gates whether tracking runs at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, enabled]);
}
