import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface OutlookEmail {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  receivedDateTime: string;
  hasAttachments: boolean;
  bodyPreview: string;
  isRead: boolean;
}

interface UseOutlookInboxOptions {
  folder?: string;
  top?: number;
}

export function useOutlookInbox(options: UseOutlookInboxOptions = {}) {
  const { folder = "inbox", top = 50 } = options;
  const { user } = useAuth();
  const [emails, setEmails] = useState<OutlookEmail[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasConnection, setHasConnection] = useState(false);

  // Check if user has Microsoft connection
  const checkConnection = useCallback(async () => {
    if (!user?.id) return false;

    const { data, error } = await supabase
      .from("oauth_tokens_safe")
      .select("provider, expires_at")
      .eq("user_id", user.id)
      .eq("provider", "microsoft")
      .single();

    if (error || !data) {
      setHasConnection(false);
      return false;
    }

    // Check if token is expired
    if (new Date(data.expires_at) < new Date()) {
      setHasConnection(false);
      return false;
    }

    setHasConnection(true);
    return true;
  }, [user?.id]);

  // Fetch emails from Outlook
  const fetchEmails = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Get the access token from the edge function
      const { data, error: funcError } = await supabase.functions.invoke("sync-outlook-calendar", {
        body: { action: "get-emails", folder, top },
      });

      if (funcError) throw funcError;
      if (data?.error) throw new Error(data.error);

      setEmails(data?.emails || []);
    } catch (err) {
      console.error("Error fetching Outlook emails:", err);
      const message = err instanceof Error ? err.message : "Failed to fetch emails";
      setError(message);
      
      if (message.includes("not connected") || message.includes("expired")) {
        setHasConnection(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, folder, top]);

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
