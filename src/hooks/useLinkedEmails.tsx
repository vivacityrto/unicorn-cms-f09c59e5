import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface LinkedEmail {
  id: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  received_at: string | null;
  has_attachments: boolean;
  body_preview: string | null;
  client_id: number | null;
  package_id: number | null;
  task_id: string | null;
  created_at: string;
}

export interface EmailAttachment {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  storage_path: string;
}

interface LinkEmailParams {
  message_id: string;
  tenant_id: string;
  client_id?: string;
  package_id?: string;
  task_id?: string;
}

export function useLinkedEmails(options?: {
  clientId?: number;
  packageId?: number;
  taskId?: string;
}) {
  const queryClient = useQueryClient();

  // Fetch linked emails with optional filters
  const {
    data: emails,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["linked-emails", options?.clientId, options?.packageId, options?.taskId],
    queryFn: async () => {
      let query = supabase
        .from("email_messages")
        .select("*")
        .order("received_at", { ascending: false });

      if (options?.clientId) {
        query = query.eq("client_id", options.clientId);
      }
      if (options?.packageId) {
        query = query.eq("package_id", options.packageId);
      }
      if (options?.taskId) {
        query = query.eq("task_id", options.taskId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as LinkedEmail[];
    },
  });

  // Link email mutation
  const linkEmailMutation = useMutation({
    mutationFn: async (params: LinkEmailParams) => {
      const { data, error } = await supabase.functions.invoke("capture-outlook-email", {
        body: params,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      toast.success("Email linked successfully");
      queryClient.invalidateQueries({ queryKey: ["linked-emails"] });
    },
    onError: (error: Error) => {
      console.error("Link email error:", error);
      if (error.message.includes("already linked")) {
        toast.error("This email is already linked");
      } else if (error.message.includes("not connected")) {
        toast.error("Please connect your Outlook account first");
      } else if (error.message.includes("expired")) {
        toast.error("Your Outlook session has expired. Please reconnect.");
      } else {
        toast.error(error.message || "Failed to link email");
      }
    },
  });

  // Update email linking
  const updateLinkMutation = useMutation({
    mutationFn: async ({
      emailId,
      updates,
    }: {
      emailId: string;
      updates: { client_id?: number | null; package_id?: number | null; task_id?: string | null };
    }) => {
      const { error } = await supabase
        .from("email_messages")
        .update(updates)
        .eq("id", emailId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Email link updated");
      queryClient.invalidateQueries({ queryKey: ["linked-emails"] });
    },
    onError: (error) => {
      console.error("Update link error:", error);
      toast.error("Failed to update email link");
    },
  });

  // Fetch attachments for an email
  const fetchAttachments = useCallback(async (emailId: string): Promise<EmailAttachment[]> => {
    const { data, error } = await supabase
      .from("email_message_attachments")
      .select("*")
      .eq("email_message_id", emailId);

    if (error) {
      console.error("Fetch attachments error:", error);
      return [];
    }

    return data as EmailAttachment[];
  }, []);

  // Get attachment download URL
  const getAttachmentUrl = useCallback(async (storagePath: string): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from("email-attachments")
      .createSignedUrl(storagePath, 3600); // 1 hour expiry

    if (error) {
      console.error("Get attachment URL error:", error);
      return null;
    }

    return data.signedUrl;
  }, []);

  return {
    emails: emails || [],
    isLoading,
    error,
    refetch,
    linkEmail: linkEmailMutation.mutate,
    isLinking: linkEmailMutation.isPending,
    updateLink: updateLinkMutation.mutate,
    isUpdating: updateLinkMutation.isPending,
    fetchAttachments,
    getAttachmentUrl,
  };
}
