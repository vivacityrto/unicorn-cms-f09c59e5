import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface CategoryPrefs {
  tasks: boolean;
  meetings: boolean;
  obligations: boolean;
  events: boolean;
}

const DEFAULT_CATEGORIES: CategoryPrefs = {
  tasks: true,
  meetings: true,
  obligations: true,
  events: true,
};

function parseCategories(eventSettings: unknown): CategoryPrefs {
  if (typeof eventSettings === "object" && eventSettings !== null) {
    const es = eventSettings as Record<string, unknown>;
    if (typeof es.categories === "object" && es.categories !== null) {
      const cats = es.categories as Record<string, unknown>;
      return {
        tasks: cats.tasks !== false,
        meetings: cats.meetings !== false,
        obligations: cats.obligations !== false,
        events: cats.events !== false,
      };
    }
  }
  return { ...DEFAULT_CATEGORIES };
}

export function useNotificationPrefs() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["notification-prefs", profile?.user_uuid],
    queryFn: async (): Promise<{ categories: CategoryPrefs; raw: Record<string, unknown> }> => {
      const { data, error } = await supabase.rpc("get_user_notification_prefs" as any);
      if (error) throw error;

      // RPC returns a single row or array with one row
      const row = Array.isArray(data) ? data[0] : data;
      const eventSettings = row?.event_settings ?? {};
      return {
        categories: parseCategories(eventSettings),
        raw: row ?? {},
      };
    },
    enabled: !!profile?.user_uuid,
  });

  const updateMutation = useMutation({
    mutationFn: async (updated: CategoryPrefs) => {
      // Merge categories into existing event_settings
      const currentRaw = query.data?.raw ?? {};
      const currentEventSettings =
        typeof (currentRaw as any).event_settings === "object"
          ? (currentRaw as any).event_settings
          : {};

      const newEventSettings = {
        ...currentEventSettings,
        categories: updated,
      };

      const { error } = await supabase.rpc("update_user_notification_prefs" as any, {
        p_email_enabled: (currentRaw as any).email_enabled ?? true,
        p_inapp_enabled: (currentRaw as any).inapp_enabled ?? true,
        p_digest_enabled: (currentRaw as any).digest_enabled ?? false,
        p_quiet_hours: (currentRaw as any).quiet_hours ?? {},
        p_event_settings: newEventSettings,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-prefs"] });
      toast({ title: "Preferences saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const categories = query.data?.categories ?? DEFAULT_CATEGORIES;

  const updateCategory = (key: keyof CategoryPrefs, enabled: boolean) => {
    const updated = { ...categories, [key]: enabled };
    updateMutation.mutate(updated);
  };

  return {
    categories,
    isLoading: query.isLoading,
    updateCategory,
    isUpdating: updateMutation.isPending,
  };
}
