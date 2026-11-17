import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

/**
 * A person's notification preference matrix: category x channel, plus a scope
 * per category that says whose clients they hear about. Mirrors the database
 * rule in notification_effective_pref(): the person's own row, else the role
 * default, else enabled with the default scope.
 */

export type NotificationChannel = 'in_app' | 'teams' | 'email';
export type NotificationScope = 'my_clients' | 'my_and_delegated' | 'all_clients' | 'off';

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ['in_app', 'teams', 'email'];

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'In-app',
  teams: 'Teams',
  email: 'Email',
};

export const SCOPE_LABELS: Record<NotificationScope, string> = {
  my_clients: 'My clients',
  my_and_delegated: 'My clients and people I assist',
  all_clients: 'All clients',
  off: 'Off',
};

const DEFAULT_SCOPE: NotificationScope = 'my_and_delegated';

/** Categories whose audience is "the owners of a client", so a scope applies. */
const OWNER_CATEGORIES = new Set([
  'client_message',
  'support_ticket',
  'client_note',
  'package_alert',
  'risk_flag',
]);

export const isOwnerCategory = (category: string): boolean => OWNER_CATEGORIES.has(category);

type CategoryRow = Tables<'notification_category'>;
type PreferenceRow = Tables<'notification_preferences'>;
type RoleDefaultRow = Tables<'notification_role_defaults'>;

interface MatrixData {
  categories: CategoryRow[];
  preferences: PreferenceRow[];
  roleDefaults: RoleDefaultRow[];
}

export interface EffectiveCell {
  enabled: boolean;
  scope: NotificationScope;
  /** True when the value comes from the person's own saved row. */
  isCustom: boolean;
}

const asScope = (value: string | null | undefined): NotificationScope =>
  value === 'my_clients' || value === 'my_and_delegated' || value === 'all_clients' || value === 'off'
    ? value
    : DEFAULT_SCOPE;

export function useNotificationMatrix() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const userId = profile?.user_uuid;
  const role = profile?.unicorn_role ?? null;

  const query = useQuery({
    queryKey: ['notification-matrix', userId, role],
    enabled: !!userId,
    queryFn: async (): Promise<MatrixData> => {
      const [categories, preferences, roleDefaults] = await Promise.all([
        supabase
          .from('notification_category')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase.from('notification_preferences').select('*').eq('user_id', userId as string),
        role
          ? supabase.from('notification_role_defaults').select('*').eq('role', role)
          : Promise.resolve({ data: [] as RoleDefaultRow[], error: null }),
      ]);
      if (categories.error) throw categories.error;
      if (preferences.error) throw preferences.error;
      if (roleDefaults.error) throw roleDefaults.error;
      return {
        categories: categories.data ?? [],
        preferences: preferences.data ?? [],
        roleDefaults: roleDefaults.data ?? [],
      };
    },
  });

  const effective = useMemo(() => {
    const data = query.data;
    return (category: string, channel: NotificationChannel): EffectiveCell => {
      const own = data?.preferences.find((p) => p.category === category && p.channel === channel);
      if (own) return { enabled: own.enabled, scope: asScope(own.scope), isCustom: true };
      const def = data?.roleDefaults.find((d) => d.category === category && d.channel === channel);
      if (def) return { enabled: def.enabled, scope: asScope(def.scope), isCustom: false };
      return { enabled: true, scope: DEFAULT_SCOPE, isCustom: false };
    };
  }, [query.data]);

  const save = useMutation({
    mutationFn: async (rows: { category: string; channel: NotificationChannel; enabled: boolean; scope: NotificationScope }[]) => {
      if (!userId) throw new Error('Not signed in');
      const { error } = await supabase.from('notification_preferences').upsert(
        rows.map((r) => ({
          user_id: userId,
          category: r.category,
          channel: r.channel,
          enabled: r.enabled,
          scope: r.scope,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'user_id,category,channel' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-matrix'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
    },
  });

  /** Tick or untick one channel for one category, keeping that category's scope. */
  const setChannel = (category: string, channel: NotificationChannel, enabled: boolean) => {
    const scope = effective(category, 'in_app').scope;
    save.mutate([{ category, channel, enabled, scope }]);
  };

  /** Change whose clients a category covers. The scope is stored on every channel row. */
  const setScope = (category: string, scope: NotificationScope) => {
    save.mutate(
      NOTIFICATION_CHANNELS.map((channel) => ({
        category,
        channel,
        enabled: effective(category, channel).enabled,
        scope,
      })),
    );
  };

  return {
    categories: query.data?.categories ?? [],
    effective,
    isLoading: query.isLoading,
    isSaving: save.isPending,
    setChannel,
    setScope,
  };
}
