import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OutlookMailFolder {
  id: string;
  displayName: string;
  totalItemCount?: number;
}

/**
 * Lists the user's own top-level custom mail folders (system folders like
 * Inbox/Sent Items/Drafts/Junk are excluded server-side — those already have
 * their own fixed spots in the folder switcher). Fetched on demand rather
 * than automatically, since most sessions never open the custom-folder
 * picker.
 */
export function useOutlookFolders() {
  const [folders, setFolders] = useState<OutlookMailFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchFolders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: funcError } = await supabase.functions.invoke("sync-outlook-calendar", {
        body: { action: "list-folders" },
      });
      if (funcError) throw funcError;
      if (data?.error) throw new Error(data.error);
      setFolders(data?.folders || []);
      setHasFetched(true);
    } catch (err) {
      console.error("Error fetching Outlook folders:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch folders");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { folders, isLoading, error, hasFetched, fetchFolders };
}
