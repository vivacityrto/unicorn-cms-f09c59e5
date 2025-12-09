import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Json } from '@/integrations/supabase/types';

export interface ResponseOption {
  label: string;
  color?: string;
}

export interface ReusableAuditTemplate {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  options: ResponseOption[];
  is_global: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useReusableAuditTemplates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['reusable-audit-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reusable_audit_templates')
        .select('*')
        .order('is_global', { ascending: false })
        .order('name');

      if (error) throw error;
      
      // Parse the options JSON for each template
      return (data || []).map(template => ({
        ...template,
        options: Array.isArray(template.options) 
          ? (template.options as unknown as ResponseOption[])
          : []
      })) as ReusableAuditTemplate[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (newTemplate: { 
      name: string; 
      description?: string; 
      options: ResponseOption[] 
    }) => {
      if (!profile?.tenant_id) {
        throw new Error('User must be logged in with a tenant');
      }

      const { data, error } = await supabase
        .from('reusable_audit_templates')
        .insert({
          tenant_id: profile.tenant_id,
          name: newTemplate.name,
          description: newTemplate.description || null,
          options: newTemplate.options as unknown as Json,
          is_global: false,
          created_by: profile.user_uuid,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reusable-audit-templates'] });
      toast.success('Response set created successfully');
    },
    onError: (error) => {
      toast.error('Failed to create response set: ' + error.message);
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async (template: { 
      id: number; 
      name?: string; 
      description?: string; 
      options?: ResponseOption[] 
    }) => {
      const { data, error } = await supabase
        .from('reusable_audit_templates')
        .update({
          name: template.name,
          description: template.description,
          options: template.options as unknown as Json,
          updated_at: new Date().toISOString(),
        })
        .eq('id', template.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reusable-audit-templates'] });
      toast.success('Response set updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update response set: ' + error.message);
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('reusable_audit_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reusable-audit-templates'] });
      toast.success('Response set deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete response set: ' + error.message);
    },
  });

  return {
    templates,
    isLoading,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
