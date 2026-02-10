import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';

export interface AddinFeatureFlags {
  microsoft_addin_enabled: boolean;
  addin_outlook_mail_enabled: boolean;
  addin_meetings_enabled: boolean;
  addin_documents_enabled: boolean;
}

const DEFAULT_FLAGS: AddinFeatureFlags = {
  microsoft_addin_enabled: false,
  addin_outlook_mail_enabled: false,
  addin_meetings_enabled: false,
  addin_documents_enabled: false,
};

export function useAddinFeatureFlags() {
  const queryClient = useQueryClient();

  const { data: flags, isLoading, error } = useQuery({
    queryKey: ["addin-feature-flags"],
    queryFn: async (): Promise<AddinFeatureFlags> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .limit(1)
        .single();

      if (error) {
        console.error("Error fetching addin flags:", error);
        return DEFAULT_FLAGS;
      }

      // Type assertion since types may not be updated yet
      const settings = data as Record<string, unknown>;
      
      return {
        microsoft_addin_enabled: (settings?.microsoft_addin_enabled as boolean) ?? false,
        addin_outlook_mail_enabled: (settings?.addin_outlook_mail_enabled as boolean) ?? false,
        addin_meetings_enabled: (settings?.addin_meetings_enabled as boolean) ?? false,
        addin_documents_enabled: (settings?.addin_documents_enabled as boolean) ?? false,
      };
    },
    staleTime: QUERY_STALE_TIMES.PROFILE,
  });

  const updateFlagsMutation = useMutation({
    mutationFn: async (updates: Partial<AddinFeatureFlags>) => {
      const normalized = { ...updates };

      if ("microsoft_addin_enabled" in normalized && normalized.microsoft_addin_enabled === false) {
        normalized.addin_outlook_mail_enabled = false;
        normalized.addin_meetings_enabled = false;
        normalized.addin_documents_enabled = false;
      }

      // Get the current settings row id first
      const { data: current, error: fetchError } = await supabase
        .from("app_settings")
        .select("id")
        .limit(1)
        .single();

      if (fetchError || !current) {
        throw new Error("No app_settings row found");
      }

      const { data: updated, error } = await supabase
        .from("app_settings")
        .update(normalized as Record<string, unknown>)
        .eq("id", current.id)
        .select("*")
        .single();

      if (error) throw error;
      if (!updated) throw new Error("Update blocked or no rows updated");
      return updated;
    },
    onSuccess: () => {
      toast.success("Feature flags updated");
      queryClient.invalidateQueries({ queryKey: ["addin-feature-flags"] });
    },
    onError: (error: Error) => {
      console.error("Update flags error:", error);
      toast.error("Failed to update feature flags");
    },
  });

  return {
    flags: flags ?? DEFAULT_FLAGS,
    isLoading,
    error,
    updateFlags: updateFlagsMutation.mutate,
    isUpdating: updateFlagsMutation.isPending,
  };
}

// Helper to check if a specific add-in feature is enabled
export function useIsAddinFeatureEnabled(feature: keyof AddinFeatureFlags): boolean {
  const { flags } = useAddinFeatureFlags();
  
  // Master flag must be on for any sub-feature to be enabled
  if (!flags.microsoft_addin_enabled && feature !== 'microsoft_addin_enabled') {
    return false;
  }
  
  return flags[feature] ?? false;
}
