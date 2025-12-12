import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface AuditTemplateQuestion {
  id?: number;
  template_id?: number;
  question_type: string;
  label: string;
  order_index: number;
  options?: any[];
  required?: boolean;
  category: string;
}

export interface AuditTemplateCreator {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export interface AuditTemplate {
  id?: number;
  tenant_id?: number;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'locked';
  access: 'all_users' | 'restricted';
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  last_published?: string;
  questions?: AuditTemplateQuestion[];
  creator?: AuditTemplateCreator | null;
}

export function useAuditTemplates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['audit_templates', profile?.tenant_id],
    queryFn: async () => {
      // Fetch templates
      const { data: templatesData, error: templatesError } = await supabase
        .from('audit_templates')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (templatesError) throw templatesError;
      
      // Get unique creator IDs
      const creatorIds = [...new Set(templatesData?.map(t => t.created_by).filter(Boolean))] as string[];
      
      // Fetch creators if any
      let creatorsMap: Record<string, AuditTemplateCreator> = {};
      if (creatorIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('user_uuid, first_name, last_name, avatar_url')
          .in('user_uuid', creatorIds);
        
        if (usersData) {
          creatorsMap = usersData.reduce((acc, user) => {
            acc[user.user_uuid] = user;
            return acc;
          }, {} as Record<string, AuditTemplateCreator>);
        }
      }
      
      // Merge templates with creators
      return (templatesData || []).map(template => ({
        ...template,
        creator: template.created_by ? creatorsMap[template.created_by] || null : null,
      })) as AuditTemplate[];
    },
    enabled: !!profile?.tenant_id,
  });

  const createTemplate = useMutation({
    mutationFn: async (template: Omit<AuditTemplate, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('audit_templates')
        .insert({
          tenant_id: profile!.tenant_id!,
          name: template.name,
          description: template.description,
          status: template.status || 'draft',
          access: template.access || 'all_users',
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit_templates'] });
      toast.success('Template created successfully');
    },
    onError: (error) => {
      toast.error('Failed to create template: ' + error.message);
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AuditTemplate> & { id: number }) => {
      const { data, error } = await supabase
        .from('audit_templates')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit_templates'] });
    },
    onError: (error) => {
      toast.error('Failed to update template: ' + error.message);
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('audit_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit_templates'] });
      toast.success('Template deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete template: ' + error.message);
    },
  });

  return {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}

export function useAuditTemplateQuestions(templateId?: number) {
  const queryClient = useQueryClient();

  const { data: questions, isLoading } = useQuery({
    queryKey: ['audit_template_questions', templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_template_questions')
        .select('*')
        .eq('template_id', templateId!)
        .order('order_index', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  const addQuestion = useMutation({
    mutationFn: async (question: Omit<AuditTemplateQuestion, 'id'> & { template_id: number }) => {
      const { data, error } = await supabase
        .from('audit_template_questions')
        .insert({
          template_id: question.template_id,
          question_type: question.question_type,
          label: question.label,
          order_index: question.order_index,
          options: question.options || [],
          required: question.required || false,
          category: question.category,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit_template_questions', templateId] });
    },
    onError: (error) => {
      toast.error('Failed to add question: ' + error.message);
    },
  });

  const updateQuestion = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AuditTemplateQuestion> & { id: number }) => {
      const { data, error } = await supabase
        .from('audit_template_questions')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit_template_questions', templateId] });
    },
    onError: (error) => {
      toast.error('Failed to update question: ' + error.message);
    },
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('audit_template_questions')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit_template_questions', templateId] });
    },
    onError: (error) => {
      toast.error('Failed to delete question: ' + error.message);
    },
  });

  const reorderQuestions = useMutation({
    mutationFn: async (orderedQuestions: { id: number; order_index: number }[]) => {
      const updates = orderedQuestions.map(q => 
        supabase
          .from('audit_template_questions')
          .update({ order_index: q.order_index })
          .eq('id', q.id)
      );
      
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit_template_questions', templateId] });
    },
  });

  return {
    questions,
    isLoading,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
  };
}
