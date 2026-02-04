import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import { VIVACITY_TENANT_ID } from './useVivacityTeamUsers';
import type { EosAgendaTemplate, MeetingType } from '@/types/eos';

export const useEosAgendaTemplates = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['eos-agenda-templates', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_agenda_templates')
        .select('*')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .eq('is_archived', false)
        .order('is_default', { ascending: false })
        .order('is_system', { ascending: false })
        .order('template_name', { ascending: true });
      
      if (error) throw error;
      return data as unknown as EosAgendaTemplate[];
    },
    enabled: !!profile,
  });

  // Get templates by meeting type
  const getTemplatesForType = (meetingType: MeetingType) => {
    return templates?.filter(t => t.meeting_type === meetingType) || [];
  };

  // Get default template for a meeting type
  const getDefaultTemplate = (meetingType: MeetingType) => {
    return templates?.find(t => t.meeting_type === meetingType && t.is_default);
  };

  const createTemplate = useMutation({
    mutationFn: async (template: Partial<EosAgendaTemplate>) => {
      const { tenant_id, ...templateData } = template;
      const { data, error } = await supabase
        .from('eos_agenda_templates')
        .insert({ 
          ...templateData, 
          tenant_id: VIVACITY_TENANT_ID,
          is_system: false,
          is_archived: false,
        } as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-agenda-templates'] });
      toast({ title: 'Template created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating template', description: error.message, variant: 'destructive' });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EosAgendaTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from('eos_agenda_templates')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-agenda-templates'] });
      toast({ title: 'Template updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating template', description: error.message, variant: 'destructive' });
    },
  });

  const duplicateTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const original = templates?.find(t => t.id === templateId);
      if (!original) throw new Error('Template not found');

      const { data, error } = await supabase
        .from('eos_agenda_templates')
        .insert({
          tenant_id: VIVACITY_TENANT_ID,
          meeting_type: original.meeting_type,
          template_name: `${original.template_name} (Copy)`,
          description: original.description,
          segments: original.segments,
          is_default: false,
          is_system: false,
          is_archived: false,
          created_by: profile?.user_uuid,
        } as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-agenda-templates'] });
      toast({ title: 'Template duplicated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error duplicating template', description: error.message, variant: 'destructive' });
    },
  });

  const setAsDefault = useMutation({
    mutationFn: async ({ id, meetingType }: { id: string; meetingType: MeetingType }) => {
      // First, unset any existing default for this meeting type
      await supabase
        .from('eos_agenda_templates')
        .update({ is_default: false } as any)
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .eq('meeting_type', meetingType);

      // Set the new default
      const { data, error } = await supabase
        .from('eos_agenda_templates')
        .update({ is_default: true } as any)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-agenda-templates'] });
      toast({ title: 'Default template updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error setting default', description: error.message, variant: 'destructive' });
    },
  });

  const archiveTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('eos_agenda_templates')
        .update({ is_archived: true } as any)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-agenda-templates'] });
      toast({ title: 'Template archived' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error archiving template', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('eos_agenda_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-agenda-templates'] });
      toast({ title: 'Template deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting template', description: error.message, variant: 'destructive' });
    },
  });

  return {
    templates,
    isLoading,
    getTemplatesForType,
    getDefaultTemplate,
    createTemplate,
    updateTemplate,
    duplicateTemplate,
    setAsDefault,
    archiveTemplate,
    deleteTemplate,
  };
};
