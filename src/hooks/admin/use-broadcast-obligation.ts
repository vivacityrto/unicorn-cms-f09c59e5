import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PreviewResult {
  tenant_count: number;
  user_count: number;
  sample_tenants: string[];
}

export interface BroadcastResult {
  inserted: number;
}

async function invokeObligation<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("generate-notifications", {
    body,
  });
  if (error) throw error;
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    throw new Error(data.error);
  }
  return data as T;
}

export function usePreviewObligation() {
  return useMutation({
    mutationFn: async (obligationId: number): Promise<PreviewResult> => {
      const result = await invokeObligation<PreviewResult>({
        scope: "reporting_obligations",
        obligation_id: obligationId,
        preview: true,
      });
      return {
        tenant_count: Number(result?.tenant_count ?? 0),
        user_count: Number(result?.user_count ?? 0),
        sample_tenants: Array.isArray(result?.sample_tenants) ? result.sample_tenants : [],
      };
    },
  });
}

export function useBroadcastObligation() {
  return useMutation({
    mutationFn: async (obligationId: number): Promise<BroadcastResult> => {
      const result = await invokeObligation<BroadcastResult>({
        scope: "reporting_obligations",
        obligation_id: obligationId,
        broadcast: true,
      });
      return { inserted: Number(result?.inserted ?? 0) };
    },
  });
}
