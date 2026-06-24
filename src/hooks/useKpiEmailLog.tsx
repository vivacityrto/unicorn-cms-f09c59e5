import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type KpiEmailType = "general_email" | "client_message";

export interface KpiEmailLogRow {
  id: number;
  user_uuid: string;
  tenant_id: number | null;
  email_type: KpiEmailType;
  direction: "inbound" | "outbound";
  message_id: string;
  conversation_id: string | null;
  subject: string | null;
  from_address: string | null;
  to_address: string | null;
  received_at: string | null;
  sent_at: string | null;
  responded_at: string | null;
  response_minutes: number | null;
  sla_met: boolean | null;
  raw_folder: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface UseKpiEmailLogOptions {
  /** Restrict to a specific staff user. Defaults to the current user. */
  userUuid?: string;
  /** Inclusive lower bound on received_at/sent_at. */
  since?: string;
  /** Inclusive upper bound on received_at/sent_at. */
  until?: string;
  /** Filter by email type. */
  emailType?: KpiEmailType;
  /** Max rows to fetch (default 500). */
  limit?: number;
}

/**
 * Reads KPI email-log rows for the CST email SLA dashboards and exposes a
 * `sync()` method that triggers the `kpi-email-log-sync` edge function to
 * ingest the latest Inbox + Sent Items activity for the current staff user.
 */
export function useKpiEmailLog(options: UseKpiEmailLogOptions = {}) {
  const { user } = useAuth();
  const { userUuid, since, until, emailType, limit = 500 } = options;
  const subjectUuid = userUuid ?? user?.id ?? null;

  const [rows, setRows] = useState<KpiEmailLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    if (!subjectUuid) return;
    setIsLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("kpi_email_log")
        .select("*")
        .eq("user_uuid", subjectUuid)
        .order("received_at", { ascending: false, nullsFirst: false })
        .limit(limit);

      if (emailType) query = query.eq("email_type", emailType);
      if (since) query = query.gte("received_at", since);
      if (until) query = query.lte("received_at", until);

      const { data, error: qErr } = await query;
      if (qErr) throw qErr;
      setRows((data ?? []) as KpiEmailLogRow[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load KPI email log";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [subjectUuid, emailType, since, until, limit]);

  const sync = useCallback(
    async (syncOptions?: { folders?: Array<"inbox" | "sent">; top?: number }) => {
      setIsSyncing(true);
      setError(null);
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("kpi-email-log-sync", {
          body: {
            folders: syncOptions?.folders ?? ["inbox", "sent"],
            top: syncOptions?.top ?? 200,
          },
        });
        if (fnErr) throw fnErr;
        if (data?.error) throw new Error(data.error);
        toast.success(
          `KPI email sync complete — ${data?.inserted ?? 0} new, ${data?.updated ?? 0} updated`
        );
        await fetchRows();
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "KPI email sync failed";
        setError(msg);
        toast.error(msg);
        throw err;
      } finally {
        setIsSyncing(false);
      }
    },
    [fetchRows]
  );

  const logManualPair = useCallback(
    async (params: {
      inboundMessageId: string;
      outboundMessageId: string;
      emailType: KpiEmailType;
    }) => {
      setIsSyncing(true);
      setError(null);
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("kpi-email-log-sync", {
          body: {
            mode: "manual",
            inboundMessageId: params.inboundMessageId,
            outboundMessageId: params.outboundMessageId,
            emailType: params.emailType,
          },
        });
        if (fnErr) throw fnErr;
        if (data?.error) throw new Error(data.error);
        toast.success("Email response logged");
        await fetchRows();
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to log email response";
        setError(msg);
        toast.error(msg);
        throw err;
      } finally {
        setIsSyncing(false);
      }
    },
    [fetchRows]
  );

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  return { rows, isLoading, isSyncing, error, refetch: fetchRows, sync, logManualPair };
}
