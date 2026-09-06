import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { TablesUpdate } from "@/integrations/supabase/types";

export interface EmailTicket {
  id: string;
  ticket_number: string;
  sender_name: string | null;
  sender_email: string;
  tenant_id: number | null;
  category: string | null;
  urgent: boolean;
  subject: string;
  body_preview: string | null;
  original_email_id: string | null;
  triage_status: string;
  triaged_by: string | null;
  triaged_at: string | null;
  assigned_to_user_id: string | null;
  assigned_at: string | null;
  status: string;
  response_due_at: string | null;
  sla_breached: boolean;
  resolution_notes: string | null;
  closed_at: string | null;
  closed_by: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
}

const SELECT_COLS =
  "id, ticket_number, sender_name, sender_email, tenant_id, category, urgent, subject, body_preview, original_email_id, triage_status, triaged_by, triaged_at, assigned_to_user_id, assigned_at, status, response_due_at, sla_breached, resolution_notes, closed_at, closed_by, received_at, created_at, updated_at";

export function useTriageQueue() {
  return useQuery({
    queryKey: ["email-tickets", "triage"],
    queryFn: async (): Promise<EmailTicket[]> => {
      const { data, error } = await supabase
        .from("email_tickets")
        .select(SELECT_COLS)
        .eq("triage_status", "untriaged")
        .order("received_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as EmailTicket[];
    },
  });
}

export function useAllTickets() {
  return useQuery({
    queryKey: ["email-tickets", "all"],
    queryFn: async (): Promise<EmailTicket[]> => {
      const { data, error } = await supabase
        .from("email_tickets")
        .select(SELECT_COLS)
        .order("received_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as EmailTicket[];
    },
  });
}

export function useMyTickets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["email-tickets", "mine", user?.id],
    queryFn: async (): Promise<EmailTicket[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("email_tickets")
        .select(SELECT_COLS)
        .eq("assigned_to_user_id", user.id)
        .neq("status", "closed")
        .order("received_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as EmailTicket[];
    },
    enabled: !!user?.id,
  });
}

export interface UpdateEmailTicketInput {
  id: string;
  patch: Partial<EmailTicket>;
}

export function useUpdateEmailTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: UpdateEmailTicketInput) => {
      const { data, error } = await supabase
        .from("email_tickets")
        .update(patch as unknown as TablesUpdate<"email_tickets">)
        .eq("id", id)
        .select(SELECT_COLS)
        .maybeSingle();
      if (error) throw error;
      return data as EmailTicket;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email-tickets"] });
    },
  });
}
