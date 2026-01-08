import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface TimeCaptureSettings {
  id?: string;
  tenant_id: number;
  user_id: string;
  auto_create_meeting_drafts: boolean;
  min_minutes: number;
  max_minutes: number;
  include_organizer_only: boolean;
}

const DEFAULT_SETTINGS: Omit<TimeCaptureSettings, 'id' | 'tenant_id' | 'user_id'> = {
  auto_create_meeting_drafts: true,
  min_minutes: 10,
  max_minutes: 240,
  include_organizer_only: false
};

export function useTimeCaptureSettings() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<TimeCaptureSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!user || !profile?.tenant_id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_time_capture_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[useTimeCaptureSettings] Error fetching settings:', error);
        setSettings(null);
      } else if (data) {
        setSettings(data as TimeCaptureSettings);
      } else {
        // Return default settings (not yet saved to DB)
        setSettings({
          tenant_id: profile.tenant_id,
          user_id: user.id,
          ...DEFAULT_SETTINGS
        });
      }
    } catch (err) {
      console.error('[useTimeCaptureSettings] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, profile?.tenant_id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (updates: Partial<Omit<TimeCaptureSettings, 'id' | 'tenant_id' | 'user_id'>>) => {
    if (!user || !profile?.tenant_id) {
      toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
      return false;
    }

    setSaving(true);

    try {
      const newSettings = {
        ...DEFAULT_SETTINGS,
        ...settings,
        ...updates,
        tenant_id: profile.tenant_id,
        user_id: user.id
      };

      // Upsert settings
      const { data, error } = await supabase
        .from('user_time_capture_settings')
        .upsert(
          {
            tenant_id: newSettings.tenant_id,
            user_id: newSettings.user_id,
            auto_create_meeting_drafts: newSettings.auto_create_meeting_drafts,
            min_minutes: newSettings.min_minutes,
            max_minutes: newSettings.max_minutes,
            include_organizer_only: newSettings.include_organizer_only
          },
          { onConflict: 'user_id' }
        )
        .select()
        .single();

      if (error) {
        console.error('[useTimeCaptureSettings] Error saving settings:', error);
        toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
        return false;
      }

      setSettings(data as TimeCaptureSettings);
      toast({ title: 'Settings saved' });
      return true;
    } catch (err) {
      console.error('[useTimeCaptureSettings] Unexpected error:', err);
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  }, [user, profile?.tenant_id, settings, toast]);

  return {
    settings,
    loading,
    saving,
    updateSettings,
    refetch: fetchSettings
  };
}
