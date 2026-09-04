import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";

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

interface NotificationPrefsRow {
  email_enabled?: boolean | null;
  inapp_enabled?: boolean | null;
  digest_enabled?: boolean | null;
  quiet_hours?: Json;
  event_settings?: Json;
}

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
    queryFn: async (): Promise<{ categories: CategoryPrefs; raw: NotificationPrefsRow }> => {
      const { data, error } = await supabase.rpc("get_user_notification_prefs");
      if (error) throw error;

      // RPC returns a single row or array with one row
      const rawData = Array.isArray(data) ? data[0] : data;
      const row = (rawData ?? {}) as unknown as NotificationPrefsRow;
      const eventSettings = row.event_settings ?? {};
      return {
        categories: parseCategories(eventSettings),
        raw: row,
      };
    },
    enabled: !!profile?.user_uuid,
  });

  const updateMutation = useMutation({
    mutationFn: async (updated: CategoryPrefs) => {
      // Merge categories into existing event_settings
      const currentRaw: NotificationPrefsRow = query.data?.raw ?? {};
      const currentEventSettings =
        typeof currentRaw.event_settings === "object" && currentRaw.event_settings !== null
          ? currentRaw.event_settings
          : {};

      const newEventSettings = {
        ...currentEventSettings,
        categories: updated,
      };

      // update_user_notification_prefs takes a single p_prefs jsonb argument (confirmed
      // via pg_get_function_identity_arguments) — not five separate p_-prefixed params.
      const { error } = await supabase.rpc("update_user_notification_prefs", {
        p_prefs: {
          email_enabled: currentRaw.email_enabled ?? true,
          inapp_enabled: currentRaw.inapp_enabled ?? true,
          digest_enabled: currentRaw.digest_enabled ?? false,
          quiet_hours: currentRaw.quiet_hours ?? {},
          event_settings: newEventSettings,
        } as unknown as Json,
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
