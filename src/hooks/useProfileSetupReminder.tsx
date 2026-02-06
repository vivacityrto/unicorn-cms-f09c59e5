import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface ProfileSetupPromptPrefs {
  user_uuid: string;
  last_shown_at: string | null;
  snoozed_until: string | null;
  dismissed_until: string | null;
}

interface MissingField {
  field: string;
  label: string;
  tab: 'profile' | 'team';
}

const VIVACITY_ROLES = ['Super Admin', 'Team Leader', 'Team Member'];

/**
 * Hook to manage profile setup reminder for Vivacity Team users
 */
export function useProfileSetupReminder() {
  const { user, profile, loading: authLoading } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [missingFields, setMissingFields] = useState<MissingField[]>([]);
  const [loading, setLoading] = useState(true);

  // Check if user is Vivacity Team
  const isVivacityTeam = profile?.unicorn_role && VIVACITY_ROLES.includes(profile.unicorn_role);

  // Compute missing required fields
  const computeMissingFields = useCallback((): MissingField[] => {
    if (!profile) return [];
    
    const missing: MissingField[] = [];
    
    if (!profile.first_name?.trim()) {
      missing.push({ field: 'first_name', label: 'Add your first name', tab: 'profile' });
    }
    if (!profile.last_name?.trim()) {
      missing.push({ field: 'last_name', label: 'Add your last name', tab: 'profile' });
    }
    
    return missing;
  }, [profile]);

  // Check additional team profile fields (requires separate query)
  const checkTeamProfileFields = useCallback(async (): Promise<MissingField[]> => {
    if (!user?.id) return [];
    
    const { data: teamUser } = await supabase
      .from('users')
      .select('timezone, job_title')
      .eq('user_uuid', user.id)
      .maybeSingle();
    
    const missing: MissingField[] = [];
    
    if (!teamUser?.timezone) {
      missing.push({ field: 'timezone', label: 'Set your timezone', tab: 'team' });
    }
    if (!teamUser?.job_title?.trim()) {
      missing.push({ field: 'job_title', label: 'Add your job title', tab: 'profile' });
    }
    
    return missing;
  }, [user?.id]);

  // Check if modal should be shown based on preferences
  const shouldShowModal = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;
    
    const { data: prefs } = await supabase
      .from('user_profile_setup_prompts')
      .select('*')
      .eq('user_uuid', user.id)
      .maybeSingle();
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    if (prefs) {
      // Check if snoozed
      if (prefs.snoozed_until && new Date(prefs.snoozed_until) > now) {
        return false;
      }
      // Check if dismissed
      if (prefs.dismissed_until && new Date(prefs.dismissed_until) > now) {
        return false;
      }
      // Check if already shown today
      if (prefs.last_shown_at) {
        const lastShownDate = new Date(prefs.last_shown_at).toISOString().split('T')[0];
        if (lastShownDate === today) {
          return false;
        }
      }
    }
    
    return true;
  }, [user?.id]);

  // Record that modal was shown
  const recordModalShown = useCallback(async (missingCount: number) => {
    if (!user?.id) return;
    
    const now = new Date().toISOString();
    
    // Upsert the prompt prefs
    await supabase
      .from('user_profile_setup_prompts')
      .upsert({
        user_uuid: user.id,
        last_shown_at: now,
        updated_at: now,
      }, { onConflict: 'user_uuid' });
    
    // Log audit event
    await supabase
      .from('audit_events')
      .insert({
        action: 'profile_setup_prompt_shown',
        entity: 'user_profile_setup',
        entity_id: user.id,
        user_id: user.id,
        details: { missing_fields_count: missingCount }
      });
  }, [user?.id]);

  // Handle snooze (7 days)
  const handleSnooze = useCallback(async () => {
    if (!user?.id) return;
    
    const now = new Date();
    const snoozedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    await supabase
      .from('user_profile_setup_prompts')
      .upsert({
        user_uuid: user.id,
        snoozed_until: snoozedUntil.toISOString(),
        updated_at: now.toISOString(),
      }, { onConflict: 'user_uuid' });
    
    // Log audit event
    await supabase
      .from('audit_events')
      .insert({
        action: 'profile_setup_prompt_snoozed',
        entity: 'user_profile_setup',
        entity_id: user.id,
        user_id: user.id,
        details: { snoozed_until: snoozedUntil.toISOString() }
      });
    
    setShowModal(false);
  }, [user?.id]);

  // Handle dismiss (30 days)
  const handleDismiss = useCallback(async () => {
    if (!user?.id) return;
    
    const now = new Date();
    const dismissedUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    await supabase
      .from('user_profile_setup_prompts')
      .upsert({
        user_uuid: user.id,
        dismissed_until: dismissedUntil.toISOString(),
        updated_at: now.toISOString(),
      }, { onConflict: 'user_uuid' });
    
    // Log audit event
    await supabase
      .from('audit_events')
      .insert({
        action: 'profile_setup_prompt_dismissed',
        entity: 'user_profile_setup',
        entity_id: user.id,
        user_id: user.id,
        details: { dismissed_until: dismissedUntil.toISOString() }
      });
    
    setShowModal(false);
  }, [user?.id]);

  // Log when user goes to settings from prompt
  const logSettingsOpened = useCallback(async () => {
    if (!user?.id) return;
    
    await supabase
      .from('audit_events')
      .insert({
        action: 'profile_settings_opened_from_prompt',
        entity: 'user_profile_setup',
        entity_id: user.id,
        user_id: user.id,
        details: { missing_fields_count: missingFields.length }
      });
    
    setShowModal(false);
  }, [user?.id, missingFields.length]);

  // Get the best tab to navigate to
  const getBestTab = useCallback((): string => {
    const teamFields = missingFields.filter(f => f.tab === 'team');
    if (teamFields.length > 0) return 'team';
    return 'profile';
  }, [missingFields]);

  // Main effect to check and show modal
  useEffect(() => {
    const checkAndShowModal = async () => {
      if (authLoading || !user?.id || !profile) {
        setLoading(false);
        return;
      }
      
      // Only for Vivacity Team
      if (!isVivacityTeam) {
        setLoading(false);
        return;
      }
      
      try {
        // Get all missing fields
        const basicMissing = computeMissingFields();
        const teamMissing = await checkTeamProfileFields();
        const allMissing = [...basicMissing, ...teamMissing];
        
        // If profile is complete, don't show
        if (allMissing.length === 0) {
          setLoading(false);
          return;
        }
        
        // Check preferences
        const canShow = await shouldShowModal();
        if (!canShow) {
          setLoading(false);
          return;
        }
        
        // Show modal
        setMissingFields(allMissing);
        setShowModal(true);
        await recordModalShown(allMissing.length);
      } catch (error) {
        console.error('Error checking profile setup:', error);
      } finally {
        setLoading(false);
      }
    };
    
    checkAndShowModal();
  }, [authLoading, user?.id, profile, isVivacityTeam, computeMissingFields, checkTeamProfileFields, shouldShowModal, recordModalShown]);

  return {
    showModal,
    setShowModal,
    missingFields,
    loading,
    handleSnooze,
    handleDismiss,
    logSettingsOpened,
    getBestTab,
  };
}
