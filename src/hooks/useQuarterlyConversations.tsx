import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import type { QuarterlyConversation, QCTemplate, QCAnswer, QCFit, QCFormData, QCLinkCreate } from '@/types/qc';

export const useQuarterlyConversations = () => {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = isSuperAdmin();

  // Fetch all QCs user has access to
  const { data: conversations, isLoading } = useQuery({
    queryKey: ['qc-conversations', isSuper ? 'all' : profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_qc')
        .select('*')
        .order('scheduled_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as QuarterlyConversation[];
    },
    enabled: isSuper || !!profile?.tenant_id,
  });

  // Fetch templates
  const { data: templates } = useQuery({
    queryKey: ['qc-templates', isSuper ? 'all' : profile?.tenant_id],
    queryFn: async () => {
      let query = supabase
        .from('eos_qc_templates')
        .select('*')
        .order('is_default', { ascending: false });
      
      // SuperAdmins see all templates; others filter by their tenant
      if (!isSuper && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as QCTemplate[];
    },
    enabled: isSuper || !!profile?.tenant_id,
  });

  // Schedule new QC
  const scheduleQC = useMutation({
    mutationFn: async (formData: QCFormData) => {
      const { data, error } = await supabase.rpc('qc_schedule', {
        p_reviewee_id: formData.reviewee_id,
        p_manager_ids: formData.manager_ids,
        p_template_id: formData.template_id,
        p_quarter_start: formData.quarter_start,
        p_quarter_end: formData.quarter_end,
        p_scheduled_at: formData.scheduled_at || null,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc-conversations'] });
      toast({ title: 'Quarterly Conversation scheduled successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error scheduling QC', description: error.message, variant: 'destructive' });
    },
  });

  // Upsert answer
  const upsertAnswer = useMutation({
    mutationFn: async ({
      qc_id,
      section_key,
      prompt_key,
      value_json,
      respondent_role,
    }: {
      qc_id: string;
      section_key: string;
      prompt_key: string;
      value_json: Record<string, any>;
      respondent_role: 'manager' | 'reviewee';
    }) => {
      const { data, error } = await supabase.rpc('qc_upsert_answer', {
        p_qc_id: qc_id,
        p_section_key: section_key,
        p_prompt_key: prompt_key,
        p_value_json: value_json,
        p_respondent_role: respondent_role,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc-answers'] });
    },
    onError: (error: Error) => {
      console.error('Error saving answer:', error);
      toast({ title: 'Error saving answer', description: error.message, variant: 'destructive' });
    },
  });

  // Set GWC fit
  const setFit = useMutation({
    mutationFn: async ({
      qc_id,
      gets_it,
      wants_it,
      capacity,
      notes,
      seat_id,
      respondent_role,
    }: {
      qc_id: string;
      gets_it: boolean;
      wants_it: boolean;
      capacity: boolean;
      notes?: string;
      seat_id?: string;
      respondent_role: 'manager' | 'reviewee';
    }) => {
      const { data, error } = await supabase.rpc('qc_set_fit', {
        p_qc_id: qc_id,
        p_gets_it: gets_it,
        p_wants_it: wants_it,
        p_capacity: capacity,
        p_notes: notes || null,
        p_seat_id: seat_id || null,
        p_respondent_role: respondent_role,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc-fit'] });
      toast({ title: 'GWC assessment saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving GWC', description: error.message, variant: 'destructive' });
    },
  });

  // Create links (issues, todos, rocks)
  const createLinks = useMutation({
    mutationFn: async ({ qc_id, links }: { qc_id: string; links: QCLinkCreate[] }) => {
      const { data, error } = await supabase.rpc('qc_create_links', {
        p_qc_id: qc_id,
        p_links: links as any,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc-links'] });
      toast({ title: 'Action items created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating items', description: error.message, variant: 'destructive' });
    },
  });

  // Sign QC
  const signQC = useMutation({
    mutationFn: async ({ qc_id, role }: { qc_id: string; role: 'manager' | 'reviewee' }) => {
      const { data, error } = await supabase.rpc('qc_sign', {
        p_qc_id: qc_id,
        p_role: role,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (isFullySigned) => {
      queryClient.invalidateQueries({ queryKey: ['qc-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['qc-signoffs'] });
      toast({ 
        title: isFullySigned ? 'QC completed and locked' : 'Signature recorded',
        description: isFullySigned ? 'Both parties have signed. The conversation is now complete.' : 'Waiting for other party to sign.'
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error signing QC', description: error.message, variant: 'destructive' });
    },
  });

  // Schedule next QC
  const scheduleNext = useMutation({
    mutationFn: async ({ qc_id, next_start }: { qc_id: string; next_start?: string }) => {
      const { data, error } = await supabase.rpc('qc_schedule_next', {
        p_current_qc_id: qc_id,
        p_next_quarter_start: next_start || null,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc-conversations'] });
      toast({ title: 'Next QC scheduled successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error scheduling next QC', description: error.message, variant: 'destructive' });
    },
  });

  // Start meeting (manager only)
  const startMeeting = useMutation({
    mutationFn: async (qc_id: string) => {
      const { error } = await supabase.rpc('qc_start_meeting', {
        p_qc_id: qc_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qc-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['qc-detail'] });
      toast({ title: 'Meeting started', description: 'Both parties can now see all responses side-by-side.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error starting meeting', description: error.message, variant: 'destructive' });
    },
  });

  return {
    conversations,
    isLoading,
    templates,
    scheduleQC,
    upsertAnswer,
    setFit,
    createLinks,
    signQC,
    scheduleNext,
    startMeeting,
  };
};

// Hook for fetching a single QC with all related data
export const useQCDetails = (qcId: string | undefined) => {
  const { data: qc, isLoading: qcLoading } = useQuery({
    queryKey: ['qc-detail', qcId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_qc')
        .select('*')
        .eq('id', qcId!)
        .maybeSingle();
      
      if (error) throw error;
      return data as unknown as QuarterlyConversation | null;
    },
    enabled: !!qcId,
  });

  const { data: template } = useQuery({
    queryKey: ['qc-template', qc?.template_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_qc_templates')
        .select('*')
        .eq('id', qc?.template_id!)
        .maybeSingle();
      
      if (error) throw error;
      return data as unknown as QCTemplate | null;
    },
    enabled: !!qc?.template_id,
  });

  const { data: answers } = useQuery({
    queryKey: ['qc-answers', qcId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_qc_answers')
        .select('*')
        .eq('qc_id', qcId!);
      
      if (error) throw error;
      return data as unknown as QCAnswer[];
    },
    enabled: !!qcId,
  });

  const { data: fit } = useQuery({
    queryKey: ['qc-fit', qcId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_qc_fit')
        .select('*')
        .eq('qc_id', qcId!);
      
      if (error) throw error;
      return data as unknown as QCFit[];
    },
    enabled: !!qcId,
  });

  const { data: signoffs } = useQuery({
    queryKey: ['qc-signoffs', qcId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_qc_signoffs')
        .select('*')
        .eq('qc_id', qcId!);
      
      if (error) throw error;
      return data;
    },
    enabled: !!qcId,
  });

  const { data: links } = useQuery({
    queryKey: ['qc-links', qcId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_qc_links')
        .select('*')
        .eq('qc_id', qcId!);
      
      if (error) throw error;
      return data;
    },
    enabled: !!qcId,
  });

  return {
    qc,
    template,
    answers,
    fit,
    signoffs,
    links,
    isLoading: qcLoading,
  };
};