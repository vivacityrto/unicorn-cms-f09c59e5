import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import type { EosAgendaTemplate } from '@/types/eos';

export const useEosAgendaTemplates = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['eos-agenda-templates', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_agenda_templates')
        .select('*')
        .eq('tenant_id', profile?.tenant_id!)
        .order('is_default', { ascending: false });
      
      if (error) throw error;
      return data as unknown as EosAgendaTemplate[];
    },
    enabled: !!profile?.tenant_id,
  });

  const createTemplate = useMutation({
    mutationFn: async (template: Partial<EosAgendaTemplate>) => {
      const { tenant_id, ...templateData } = template;
      const { data, error } = await supabase
        .from('eos_agenda_templates')
        .insert({ ...templateData, tenant_id: profile?.tenant_id } as any)
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
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
};
