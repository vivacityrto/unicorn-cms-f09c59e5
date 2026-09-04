/**
 * useUIPrefs – Unicorn 2.0
 *
 * Fetches and manages user_ui_prefs.
 * Seeds a row on first load if missing.
 * Respects OS prefers-reduced-motion.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';

export interface UIPrefs {
  reduce_motion: boolean;
  celebrations_enabled: boolean;
  sound_enabled: boolean;
}

const DEFAULTS: UIPrefs = {
  reduce_motion: false,
  celebrations_enabled: true,
  sound_enabled: false,
};

export function useUIPrefs() {
  const [prefs, setPrefs] = useState<UIPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Detect OS preference
  const osReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoading(false); return; }
      setUserId(user.id);

      // Try fetch
      const { data, error } = await supabase
        .from('user_ui_prefs')
        .select('reduce_motion, celebrations_enabled, sound_enabled')
        .eq('user_uuid', user.id)
        .maybeSingle();

      if (error) {
        console.error('[UIPrefs] fetch error:', error);
        setLoading(false);
        return;
      }

      if (data) {
        setPrefs({
          reduce_motion: data.reduce_motion ?? osReducedMotion,
          celebrations_enabled: data.celebrations_enabled ?? true,
          sound_enabled: data.sound_enabled ?? false,
        });
      } else {
        // Seed row with OS preference
        const seedPrefs = {
          ...DEFAULTS,
          reduce_motion: osReducedMotion,
        };
        await supabase.from('user_ui_prefs').insert({
          user_uuid: user.id,
          ...seedPrefs,
        });
        setPrefs(seedPrefs);
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [osReducedMotion]);

  const updatePref = useCallback(
    async <K extends keyof UIPrefs>(key: K, value: UIPrefs[K]) => {
      setPrefs(prev => ({ ...prev, [key]: value }));
      if (userId) {
        const updates = { [key]: value, updated_at: new Date().toISOString() } as TablesUpdate<'user_ui_prefs'>;
        await supabase
          .from('user_ui_prefs')
          .update(updates)
          .eq('user_uuid', userId);
      }
    },
    [userId],
  );

  return { prefs, loading, updatePref, osReducedMotion };
}
