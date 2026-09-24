import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOutlookConnectionStatus } from "@/hooks/useOutlookConnectionStatus";
import type { OutlookEmail } from "@/types/outlookEmail";

interface UseOutlookInboxOptions {
  folder?: string;
  top?: number;
  filterEmail?: string;
}

export function useOutlookInbox(options: UseOutlookInboxOptions = {}) {
  const { folder = "inbox", top = 50, filterEmail } = options;
  const { user } = useAuth();
  const [emails, setEmails] = useState<OutlookEmail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Single source of truth for "is Outlook connected" (see
  // useOutlookConnectionStatus) — this hook used to run its own, weaker
  // check (a raw client-side expires_at comparison) which could report
  // "not connected" for a token that was merely due for its next 30-min
  // cron refresh but still had a perfectly good refresh_token, forcing
  // users through a full reconnect for nothing.
  const { isConnected, refetch: refetchConnectionStatus } = useOutlookConnectionStatus();
  const hasConnection = isConnected;
  const checkConnection = useCallback(async () => {
    const { data } = await refetchConnectionStatus();
    return data?.connection_status === "connected";
  }, [refetchConnectionStatus]);

  // Fetch emails from Outlook
  const fetchEmails = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get the access token from the edge function
      const { data, error: funcError } = await supabase.functions.invoke("sync-outlook-calendar", {
        body: { action: "get-emails", folder, top, filterEmail },
      });

      if (funcError) throw funcError;
      if (data?.error) throw new Error(data.error);

      setEmails(data?.emails || []);
    } catch (err) {
      console.error("Error fetching Outlook emails:", err);
      const message = err instanceof Error ? err.message : "Failed to fetch emails";
      setError(message);
      
      if (message.includes("not connected") || message.includes("expired")) {
        // The edge function itself refreshes the token proactively, so
        // reaching this means the connection is genuinely gone (refresh
        // failed) — refetch the shared status so the UI reflects it.
        refetchConnectionStatus();
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, folder, top, filterEmail, refetchConnectionStatus]);

  // Initial load
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  return {
    emails,
    isLoading,
    error,
    hasConnection,
    fetchEmails,
    checkConnection,
  };
}
