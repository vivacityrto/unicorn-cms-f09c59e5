import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export interface TenantNotesData {
  last_note_date: string | null;
  last_note_snippet: string | null;
  registration_end_date: string | null;
}

export type TenantNotesMap = Record<number, TenantNotesData>;

const NOTE_BATCH_SIZE = 50;

type NoteRow = Pick<Tables<"notes">, "tenant_id" | "created_at" | "title" | "note_details">;
type ClientNoteRow = Pick<Tables<"client_notes">, "tenant_id" | "created_at" | "title" | "content">;
type RegistrationRow = Pick<Tables<"tga_rto_summary">, "tenant_id" | "registration_end_date">;

/**
 * Resolves the most recent note (across notes + client_notes) and
 * the TGA registration end date per tenant.
 */
export function useTenantNotes(tenantIds: number[]) {
  const sortedIds = [...tenantIds].sort((a, b) => a - b);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["tenants", "notes", sortedIds],
    enabled: sortedIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TenantNotesMap> => {
      const lastNoteMap: Record<number, { date: string; snippet: string }> = {};

      for (let i = 0; i < sortedIds.length; i += NOTE_BATCH_SIZE) {
        const batch = sortedIds.slice(i, i + NOTE_BATCH_SIZE);
        const [notesRes, clientNotesRes] = await Promise.all([
          supabase
            .from("notes")
            .select("tenant_id, created_at, title, note_details")
            .in("tenant_id", batch)
            .order("created_at", { ascending: false })
            .limit(batch.length * 2),
          supabase
            .from("client_notes")
            .select("tenant_id, created_at, title, content")
            .in("tenant_id", batch)
            .order("created_at", { ascending: false })
            .limit(batch.length * 2),
        ]);

        const merged = [
          ...((notesRes.data || []) as NoteRow[]).map((n) => ({
            tenant_id: n.tenant_id,
            created_at: n.created_at,
            snippet: (n.title || n.note_details || "").substring(0, 50),
          })),
          ...((clientNotesRes.data || []) as ClientNoteRow[]).map((n) => ({
            tenant_id: n.tenant_id,
            created_at: n.created_at,
            snippet: (n.title || n.content || "").substring(0, 50),
          })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        merged.forEach(note => {
          if (!lastNoteMap[note.tenant_id]) {
            lastNoteMap[note.tenant_id] = { date: note.created_at, snippet: note.snippet };
          }
        });
      }

      const { data: regEndData } = await supabase
        .from("tga_rto_summary")
        .select("tenant_id, registration_end_date")
        .in("tenant_id", sortedIds)
        .not("registration_end_date", "is", null);
      const regEndMap: Record<number, string> = {};
      (regEndData || []).forEach((r: RegistrationRow) => { regEndMap[r.tenant_id] = r.registration_end_date; });

      const result: TenantNotesMap = {};
      sortedIds.forEach(id => {
        result[id] = {
          last_note_date: lastNoteMap[id]?.date || null,
          last_note_snippet: lastNoteMap[id]?.snippet || null,
          registration_end_date: regEndMap[id] || null,
        };
      });
      return result;
    },
  });

  useEffect(() => {
    if (sortedIds.length === 0) return;

    const channel = supabase
      .channel(`tenant-notes-changes-${sortedIds.join("-")}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["tenants", "notes"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["tenants", "notes"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_notes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["tenants", "notes"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "client_notes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["tenants", "notes"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, sortedIds.join(",")]);

  return query;
}

