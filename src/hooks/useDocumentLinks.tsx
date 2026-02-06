import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DocumentLink {
  id: string;
  tenant_id: number;
  user_uuid: string;
  provider: string;
  drive_id: string;
  item_id: string;
  file_name: string | null;
  file_extension: string | null;
  mime_type: string | null;
  file_size: number | null;
  web_url: string;
  version_id: string | null;
  current_version_id: string | null;
  client_id: number | null;
  package_id: number | null;
  task_id: string | null;
  meeting_id: string | null;
  evidence_type: string | null;
  notes: string | null;
  version_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Drive {
  id: string;
  name: string;
  type: 'personal' | 'sharepoint';
  siteId?: string;
  webUrl: string;
}

export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl: string;
  file?: {
    mimeType: string;
  };
  folder?: {
    childCount: number;
  };
  parentReference?: {
    driveId: string;
  };
  lastModifiedDateTime?: string;
}

interface LinkDocumentParams {
  drive_id: string;
  item_id: string;
  client_id?: number;
  package_id?: number;
  task_id?: string;
  meeting_id?: string;
  evidence_type?: string;
  notes?: string;
}

interface UseDocumentLinksOptions {
  clientId?: number;
  packageId?: number;
  taskId?: string;
  meetingId?: string;
}

export function useDocumentLinks(options?: UseDocumentLinksOptions) {
  const queryClient = useQueryClient();

  // Fetch linked documents
  const {
    data: documents,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["document-links", options?.clientId, options?.packageId, options?.taskId, options?.meetingId],
    queryFn: async () => {
      let query = supabase
        .from("document_links")
        .select("*")
        .order("created_at", { ascending: false });

      if (options?.clientId) {
        query = query.eq("client_id", options.clientId);
      }
      if (options?.packageId) {
        query = query.eq("package_id", options.packageId);
      }
      if (options?.taskId) {
        query = query.eq("task_id", options.taskId);
      }
      if (options?.meetingId) {
        query = query.eq("meeting_id", options.meetingId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as DocumentLink[];
    },
  });

  // Link document mutation
  const linkDocumentMutation = useMutation({
    mutationFn: async (params: LinkDocumentParams) => {
      const { data, error } = await supabase.functions.invoke("link-sharepoint-document", {
        body: { action: "link", ...params },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      toast.success("Document linked successfully");
      queryClient.invalidateQueries({ queryKey: ["document-links"] });
    },
    onError: (error: Error) => {
      console.error("Link document error:", error);
      if (error.message.includes("already linked")) {
        toast.error("This document is already linked");
      } else if (error.message.includes("not connected")) {
        toast.error("Please connect your Microsoft account first");
      } else if (error.message.includes("Permission denied")) {
        toast.error("You don't have permission to access this file");
      } else if (error.message.includes("not found")) {
        toast.error("File not found");
      } else {
        toast.error(error.message || "Failed to link document");
      }
    },
  });

  // Check version mutation
  const checkVersionMutation = useMutation({
    mutationFn: async (documentLinkId: string) => {
      const { data, error } = await supabase.functions.invoke("link-sharepoint-document", {
        body: { action: "check-version", document_link_id: documentLinkId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
  });

  // Confirm version mutation
  const confirmVersionMutation = useMutation({
    mutationFn: async (documentLinkId: string) => {
      const { data, error } = await supabase.functions.invoke("link-sharepoint-document", {
        body: { action: "confirm-version", document_link_id: documentLinkId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      toast.success("Version confirmed");
      queryClient.invalidateQueries({ queryKey: ["document-links"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to confirm version");
    },
  });

  return {
    documents: documents || [],
    isLoading,
    error,
    refetch,
    linkDocument: linkDocumentMutation.mutate,
    isLinking: linkDocumentMutation.isPending,
    checkVersion: checkVersionMutation.mutateAsync,
    isCheckingVersion: checkVersionMutation.isPending,
    confirmVersion: confirmVersionMutation.mutate,
    isConfirmingVersion: confirmVersionMutation.isPending,
  };
}

// Hook for browsing drives and files
export function useSharePointBrowser() {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [isLoadingDrives, setIsLoadingDrives] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDrives = useCallback(async () => {
    setIsLoadingDrives(true);
    setError(null);

    try {
      const { data, error: funcError } = await supabase.functions.invoke("link-sharepoint-document", {
        body: { action: "browse-drives" },
      });

      if (funcError) throw funcError;
      if (data?.error) {
        if (data.error.includes("not connected") || data.error.includes("expired")) {
          setHasConnection(false);
          return;
        }
        throw new Error(data.error);
      }

      setHasConnection(true);
      setDrives(data?.drives || []);
    } catch (err) {
      console.error("Error fetching drives:", err);
      const message = err instanceof Error ? err.message : "Failed to fetch drives";
      setError(message);
    } finally {
      setIsLoadingDrives(false);
    }
  }, []);

  const fetchItems = useCallback(async (driveId: string, folderId?: string) => {
    setIsLoadingItems(true);
    setError(null);

    try {
      const { data, error: funcError } = await supabase.functions.invoke("link-sharepoint-document", {
        body: { action: "browse-items", drive_id: driveId, folder_id: folderId },
      });

      if (funcError) throw funcError;
      if (data?.error) throw new Error(data.error);

      setItems(data?.items || []);
    } catch (err) {
      console.error("Error fetching items:", err);
      const message = err instanceof Error ? err.message : "Failed to fetch files";
      setError(message);
    } finally {
      setIsLoadingItems(false);
    }
  }, []);

  const searchItems = useCallback(async (driveId: string, query: string) => {
    setIsLoadingItems(true);
    setError(null);

    try {
      const { data, error: funcError } = await supabase.functions.invoke("link-sharepoint-document", {
        body: { action: "search", drive_id: driveId, search_query: query },
      });

      if (funcError) throw funcError;
      if (data?.error) throw new Error(data.error);

      setItems(data?.items || []);
    } catch (err) {
      console.error("Error searching items:", err);
      const message = err instanceof Error ? err.message : "Search failed";
      setError(message);
    } finally {
      setIsLoadingItems(false);
    }
  }, []);

  return {
    drives,
    items,
    isLoadingDrives,
    isLoadingItems,
    hasConnection,
    error,
    fetchDrives,
    fetchItems,
    searchItems,
  };
}
