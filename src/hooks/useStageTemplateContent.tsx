import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Types for stage template content
export interface StageTeamTask {
  id: number;
  stage_id: number;
  name: string;
  description: string | null;
  sort_order: number;
  owner_role: string;
  estimated_hours: number | null;
  is_mandatory: boolean;
  created_at: string;
  created_by: string | null;
}

export interface StageClientTask {
  id: number;
  stage_id: number;
  name: string;
  description: string | null;
  sort_order: number;
  instructions: string | null;
  required_documents: string[] | null;
  is_mandatory: boolean;
  due_date_offset: number | null;
  created_at: string;
  created_by: string | null;
}

export interface StageEmail {
  id: number;
  stage_id: number;
  email_template_id: string;
  trigger_type: 'on_stage_start' | 'on_task_complete' | 'manual';
  recipient_type: 'internal' | 'tenant' | 'both';
  sort_order: number;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  email_template?: {
    id: string;
    internal_name: string;
    subject: string;
    description: string;
  };
}

export interface StageDocument {
  id: number;
  stage_id: number;
  document_id: number;
  sort_order: number;
  visibility: 'team_only' | 'tenant_download' | 'both';
  delivery_type: 'manual' | 'auto_generate';
  is_team_only: boolean;
  is_tenant_downloadable: boolean;
  is_auto_generated: boolean;
  is_tenant_visible: boolean;
  is_required: boolean;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  document?: {
    id: number;
    title: string;
    format: string | null;
    category: string | null;
    document_status?: string | null;
    ai_status?: 'pending' | 'auto_approved' | 'needs_review' | 'rejected' | null;
    ai_confidence_score?: number | null;
    ai_category_confidence?: number | null;
    ai_description_confidence?: number | null;
    ai_reasoning?: string | null;
  };
}

/**
 * Hook to manage stage template content (global stage content)
 * This is the primary editing interface for stages - no package context required
 */
export function useStageTemplateContent(stageId: number | null) {
  const { toast } = useToast();
  const [teamTasks, setTeamTasks] = useState<StageTeamTask[]>([]);
  const [clientTasks, setClientTasks] = useState<StageClientTask[]>([]);
  const [emails, setEmails] = useState<StageEmail[]>([]);
  const [documents, setDocuments] = useState<StageDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all stage template content
  const fetchContent = useCallback(async () => {
    if (!stageId) {
      setTeamTasks([]);
      setClientTasks([]);
      setEmails([]);
      setDocuments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [teamResult, clientResult, emailsResult, docsResult] = await Promise.all([
        supabase
          .from('stage_team_tasks')
          .select('*')
          .eq('stage_id', stageId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('stage_client_tasks')
          .select('*')
          .eq('stage_id', stageId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('stage_emails')
          .select(`
            *,
            email_template:email_templates(id, internal_name, subject, description)
          `)
          .eq('stage_id', stageId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('stage_documents')
          .select(`
            *,
            document:documents(id, title, format, category, document_status, ai_status, ai_confidence_score, ai_category_confidence, ai_description_confidence, ai_reasoning)
          `)
          .eq('stage_id', stageId)
          .order('sort_order', { ascending: true })
      ]);

      if (teamResult.error) throw teamResult.error;
      if (clientResult.error) throw clientResult.error;
      if (emailsResult.error) throw emailsResult.error;
      if (docsResult.error) throw docsResult.error;

      setTeamTasks((teamResult.data || []) as StageTeamTask[]);
      setClientTasks((clientResult.data || []) as StageClientTask[]);
      setEmails((emailsResult.data || []) as StageEmail[]);
      setDocuments((docsResult.data || []) as StageDocument[]);
    } catch (error: any) {
      console.error('Failed to fetch stage template content:', error);
      toast({
        title: 'Error',
        description: 'Failed to load stage content',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [stageId, toast]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Team Task CRUD
  const addTeamTask = async (data: Partial<StageTeamTask>) => {
    if (!stageId) return;

    const maxOrder = teamTasks.reduce((max, t) => Math.max(max, t.sort_order), -1);
    
    const { error } = await supabase
      .from('stage_team_tasks')
      .insert({
        stage_id: stageId,
        name: data.name,
        description: data.description || null,
        sort_order: maxOrder + 1,
        owner_role: data.owner_role || 'Admin',
        estimated_hours: data.estimated_hours || null,
        is_mandatory: data.is_mandatory ?? true
      });

    if (error) throw error;

    // Log audit event
    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId.toString(),
      action: 'stage.template_updated',
      details: { change_type: 'team_task_added', task_name: data.name }
    });

    await fetchContent();
  };

  const updateTeamTask = async (taskId: number, data: Partial<Omit<StageTeamTask, 'id'>>) => {
    const { error } = await supabase
      .from('stage_team_tasks')
      .update(data as any)
      .eq('id', taskId);

    if (error) throw error;

    // Log audit event
    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId?.toString() || '',
      action: 'stage.template_updated',
      details: { change_type: 'team_task_updated', task_id: taskId }
    });

    await fetchContent();
  };

  const deleteTeamTask = async (taskId: number) => {
    const task = teamTasks.find(t => t.id === taskId);
    
    const { error } = await supabase
      .from('stage_team_tasks')
      .delete()
      .eq('id', taskId);

    if (error) throw error;

    // Log audit event
    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId?.toString() || '',
      action: 'stage.template_updated',
      details: { change_type: 'team_task_deleted', task_name: task?.name }
    });

    await fetchContent();
  };

  // Client Task CRUD
  const addClientTask = async (data: Partial<StageClientTask>) => {
    if (!stageId) return;

    const maxOrder = clientTasks.reduce((max, t) => Math.max(max, t.sort_order), -1);
    
    const { error } = await supabase
      .from('stage_client_tasks')
      .insert({
        stage_id: stageId,
        name: data.name,
        description: data.description || null,
        sort_order: maxOrder + 1,
        instructions: data.instructions || null,
        required_documents: data.required_documents || null,
        is_mandatory: data.is_mandatory ?? true,
        due_date_offset: data.due_date_offset || null
      });

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId.toString(),
      action: 'stage.template_updated',
      details: { change_type: 'client_task_added', task_name: data.name }
    });

    await fetchContent();
  };

  const updateClientTask = async (taskId: number, data: Partial<Omit<StageClientTask, 'id'>>) => {
    const { error } = await supabase
      .from('stage_client_tasks')
      .update(data as any)
      .eq('id', taskId);

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId?.toString() || '',
      action: 'stage.template_updated',
      details: { change_type: 'client_task_updated', task_id: taskId }
    });

    await fetchContent();
  };

  const deleteClientTask = async (taskId: number) => {
    const task = clientTasks.find(t => t.id === taskId);
    
    const { error } = await supabase
      .from('stage_client_tasks')
      .delete()
      .eq('id', taskId);

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId?.toString() || '',
      action: 'stage.template_updated',
      details: { change_type: 'client_task_deleted', task_name: task?.name }
    });

    await fetchContent();
  };

  // Email CRUD
  const addEmail = async (emailTemplateId: string, triggerType: string, recipientType: string) => {
    if (!stageId) return;

    const maxOrder = emails.reduce((max, e) => Math.max(max, e.sort_order), -1);
    
    const { error } = await supabase
      .from('stage_emails')
      .insert({
        stage_id: stageId,
        email_template_id: emailTemplateId,
        trigger_type: triggerType,
        recipient_type: recipientType,
        sort_order: maxOrder + 1,
        is_active: true
      });

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId.toString(),
      action: 'stage.template_updated',
      details: { change_type: 'email_added', template_id: emailTemplateId }
    });

    await fetchContent();
  };

  const updateEmail = async (emailId: number, data: Partial<Omit<StageEmail, 'id'>>) => {
    const { error } = await supabase
      .from('stage_emails')
      .update(data as any)
      .eq('id', emailId);

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId?.toString() || '',
      action: 'stage.template_updated',
      details: { change_type: 'email_updated', email_id: emailId }
    });

    await fetchContent();
  };

  const deleteEmail = async (emailId: number) => {
    const { error } = await supabase
      .from('stage_emails')
      .delete()
      .eq('id', emailId);

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId?.toString() || '',
      action: 'stage.template_updated',
      details: { change_type: 'email_deleted', email_id: emailId }
    });

    await fetchContent();
  };

  // Document CRUD
  const addDocument = async (documentId: number, visibility: string = 'both', deliveryType: string = 'manual') => {
    if (!stageId) return;

    const maxOrder = documents.reduce((max, d) => Math.max(max, d.sort_order), -1);
    
    const { error } = await supabase
      .from('stage_documents')
      .insert({
        stage_id: stageId,
        document_id: documentId,
        sort_order: maxOrder + 1,
        visibility,
        delivery_type: deliveryType
      });

    if (error) {
      if (error.code === '23505') {
        throw new Error('This document is already linked to this stage');
      }
      throw error;
    }

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId.toString(),
      action: 'stage.template_updated',
      details: { change_type: 'document_added', document_id: documentId }
    });

    await fetchContent();
  };

  const addBulkDocuments = async (documentIds: number[], visibility: string = 'both', deliveryType: string = 'manual') => {
    if (!stageId || documentIds.length === 0) return;

    const startOrder = documents.reduce((max, d) => Math.max(max, d.sort_order), -1) + 1;

    const inserts = documentIds.map((docId, idx) => ({
      stage_id: stageId,
      document_id: docId,
      visibility,
      delivery_type: deliveryType,
      sort_order: startOrder + idx
    }));

    const { error } = await supabase
      .from('stage_documents')
      .insert(inserts);

    if (error) {
      if (error.code === '23505') {
        throw new Error('One or more documents are already linked to this stage');
      }
      throw error;
    }

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId.toString(),
      action: 'stage.template_updated',
      details: { change_type: 'documents_bulk_added', document_ids: documentIds }
    });

    await fetchContent();
  };

  const updateDocument = async (docId: number, data: { 
    visibility?: string; 
    delivery_type?: string;
    is_tenant_visible?: boolean;
    is_required?: boolean;
    notes?: string | null;
  }) => {
    const { error } = await supabase
      .from('stage_documents')
      .update(data)
      .eq('id', docId);

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId?.toString() || '',
      action: 'stage.template_updated',
      details: { change_type: 'document_updated', document_id: docId, updates: data }
    });

    await fetchContent();
  };

  const deleteDocument = async (docId: number) => {
    const { error } = await supabase
      .from('stage_documents')
      .delete()
      .eq('id', docId);

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId?.toString() || '',
      action: 'stage.template_updated',
      details: { change_type: 'document_deleted', document_id: docId }
    });

    await fetchContent();
  };

  const reorderDocuments = async (orderedIds: number[]) => {
    if (!stageId) return;

    for (let i = 0; i < orderedIds.length; i++) {
      await supabase
        .from('stage_documents')
        .update({ sort_order: i })
        .eq('id', orderedIds[i]);
    }

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId.toString(),
      action: 'stage.template_updated',
      details: { change_type: 'documents_reordered' }
    });

    await fetchContent();
  };

  return {
    teamTasks,
    clientTasks,
    emails,
    documents,
    loading,
    fetchContent,
    // Team tasks
    addTeamTask,
    updateTeamTask,
    deleteTeamTask,
    // Client tasks
    addClientTask,
    updateClientTask,
    deleteClientTask,
    // Emails
    addEmail,
    updateEmail,
    deleteEmail,
    // Documents
    addDocument,
    addBulkDocuments,
    updateDocument,
    deleteDocument,
    reorderDocuments
  };
}

/**
 * Hook to check if a package stage uses overrides
 * and provides functions to manage override state
 */
export function usePackageStageOverrides(packageId: number | null, stageId: number | null) {
  const { toast } = useToast();
  const [useOverrides, setUseOverrides] = useState(false);
  const [loading, setLoading] = useState(true);
  const [overrideCount, setOverrideCount] = useState(0);

  // Fetch override status
  const fetchOverrideStatus = useCallback(async () => {
    if (!packageId || !stageId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('package_stages')
        .select('use_overrides')
        .eq('package_id', packageId)
        .eq('stage_id', stageId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      setUseOverrides(data?.use_overrides ?? false);
    } catch (error) {
      console.error('Failed to fetch override status:', error);
    } finally {
      setLoading(false);
    }
  }, [packageId, stageId]);

  // Count packages with overrides for a stage
  const fetchOverrideCount = useCallback(async () => {
    if (!stageId) return;

    try {
      const { count } = await supabase
        .from('package_stages')
        .select('*', { count: 'exact', head: true })
        .eq('stage_id', stageId)
        .eq('use_overrides', true);

      setOverrideCount(count || 0);
    } catch (error) {
      console.error('Failed to fetch override count:', error);
    }
  }, [stageId]);

  useEffect(() => {
    fetchOverrideStatus();
    fetchOverrideCount();
  }, [fetchOverrideStatus, fetchOverrideCount]);

  // Enable overrides for this package stage
  const enableOverrides = async () => {
    if (!packageId || !stageId) return;

    const { error } = await supabase
      .from('package_stages')
      .update({ use_overrides: true })
      .eq('package_id', packageId)
      .eq('stage_id', stageId);

    if (error) throw error;

    // Log audit
    await supabase.from('package_builder_audit_log').insert({
      package_id: packageId,
      action: 'stage.override_enabled',
      entity_type: 'package_stage',
      entity_id: stageId.toString(),
      after_data: { use_overrides: true }
    });

    setUseOverrides(true);
    toast({ title: 'Overrides enabled for this package' });
  };

  // Copy template content to package overrides
  const copyTemplateToOverrides = async () => {
    if (!packageId || !stageId) return;

    try {
      // Fetch template content
      const [teamTasks, clientTasks, emails, docs] = await Promise.all([
        supabase.from('stage_team_tasks').select('*').eq('stage_id', stageId),
        supabase.from('stage_client_tasks').select('*').eq('stage_id', stageId),
        supabase.from('stage_emails').select('*').eq('stage_id', stageId),
        supabase.from('stage_documents').select('*').eq('stage_id', stageId)
      ]);

      // Copy team tasks
      if (teamTasks.data && teamTasks.data.length > 0) {
        const inserts = teamTasks.data.map(t => ({
          package_id: packageId,
          stage_id: stageId,
          name: t.name,
          description: t.description,
          order_number: t.sort_order,
          owner_role: t.owner_role,
          estimated_hours: t.estimated_hours,
          is_mandatory: t.is_mandatory
        }));
        await supabase.from('package_staff_tasks').insert(inserts);
      }

      // Copy client tasks
      if (clientTasks.data && clientTasks.data.length > 0) {
        const inserts = clientTasks.data.map(t => ({
          package_id: packageId,
          stage_id: stageId,
          name: t.name,
          description: t.description,
          order_number: t.sort_order,
          instructions: t.instructions,
          required_documents: t.required_documents,
          due_date_offset: t.due_date_offset
        }));
        await supabase.from('package_client_tasks').insert(inserts);
      }

      // Copy emails
      if (emails.data && emails.data.length > 0) {
        const inserts = emails.data.map(e => ({
          package_id: packageId,
          stage_id: stageId,
          email_template_id: e.email_template_id,
          trigger_type: e.trigger_type,
          recipient_type: e.recipient_type,
          sort_order: e.sort_order,
          is_active: e.is_active
        }));
        await supabase.from('package_stage_emails').insert(inserts);
      }

      // Copy documents
      if (docs.data && docs.data.length > 0) {
        const inserts = docs.data.map(d => ({
          package_id: packageId,
          stage_id: stageId,
          document_id: d.document_id,
          visibility: d.visibility,
          delivery_type: d.delivery_type,
          sort_order: d.sort_order
        }));
        await supabase.from('package_stage_documents').insert(inserts);
      }

      // Enable overrides
      await supabase
        .from('package_stages')
        .update({ use_overrides: true })
        .eq('package_id', packageId)
        .eq('stage_id', stageId);

      // Log audit
      await supabase.from('package_builder_audit_log').insert({
        package_id: packageId,
        action: 'stage.override_copied_from_template',
        entity_type: 'package_stage',
        entity_id: stageId.toString(),
        after_data: {
          team_tasks: teamTasks.data?.length || 0,
          client_tasks: clientTasks.data?.length || 0,
          emails: emails.data?.length || 0,
          documents: docs.data?.length || 0
        }
      });

      setUseOverrides(true);
      toast({ title: 'Template content copied to package overrides' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to copy template',
        variant: 'destructive'
      });
    }
  };

  // Reset overrides back to template
  const resetToTemplate = async () => {
    if (!packageId || !stageId) return;

    try {
      // Delete package-specific content
      await Promise.all([
        supabase.from('package_staff_tasks').delete().eq('package_id', packageId).eq('stage_id', stageId),
        supabase.from('package_client_tasks').delete().eq('package_id', packageId).eq('stage_id', stageId),
        supabase.from('package_stage_emails').delete().eq('package_id', packageId).eq('stage_id', stageId),
        supabase.from('package_stage_documents').delete().eq('package_id', packageId).eq('stage_id', stageId)
      ]);

      // Disable overrides
      await supabase
        .from('package_stages')
        .update({ use_overrides: false })
        .eq('package_id', packageId)
        .eq('stage_id', stageId);

      // Log audit
      await supabase.from('package_builder_audit_log').insert({
        package_id: packageId,
        action: 'stage.override_reset_to_template',
        entity_type: 'package_stage',
        entity_id: stageId.toString(),
        after_data: { use_overrides: false }
      });

      setUseOverrides(false);
      toast({ title: 'Stage reset to use template content' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset overrides',
        variant: 'destructive'
      });
    }
  };

  return {
    useOverrides,
    loading,
    overrideCount,
    enableOverrides,
    copyTemplateToOverrides,
    resetToTemplate,
    refetch: fetchOverrideStatus
  };
}

/**
 * Resolution hook - returns the correct content based on override status
 * For use in runtime contexts (simulation, package execution)
 */
export function useResolvedStageContent(packageId: number | null, stageId: number | null) {
  const { toast } = useToast();
  const [teamTasks, setTeamTasks] = useState<any[]>([]);
  const [clientTasks, setClientTasks] = useState<any[]>([]);
  const [emails, setEmails] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'template' | 'override'>('template');

  const fetchResolvedContent = useCallback(async () => {
    if (!packageId || !stageId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // First check if package uses overrides
      const { data: psData } = await supabase
        .from('package_stages')
        .select('use_overrides')
        .eq('package_id', packageId)
        .eq('stage_id', stageId)
        .single();

      const usesOverrides = psData?.use_overrides ?? false;
      setSource(usesOverrides ? 'override' : 'template');

      if (usesOverrides) {
        // Fetch from package_* tables
        const [teamResult, clientResult, emailsResult, docsResult] = await Promise.all([
          supabase
            .from('package_staff_tasks')
            .select('*')
            .eq('package_id', packageId)
            .eq('stage_id', stageId)
            .order('order_number', { ascending: true }),
          supabase
            .from('package_client_tasks')
            .select('*')
            .eq('package_id', packageId)
            .eq('stage_id', stageId)
            .order('order_number', { ascending: true }),
          supabase
            .from('package_stage_emails')
            .select(`*, email_templates:email_template_id(id, internal_name, subject, html_body)`)
            .eq('package_id', packageId)
            .eq('stage_id', stageId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('package_stage_documents')
            .select(`*, documents:document_id(id, doc_name, is_auto_generated, is_tenant_downloadable)`)
            .eq('package_id', packageId)
            .eq('stage_id', stageId)
            .order('sort_order', { ascending: true })
        ]);

        setTeamTasks(teamResult.data || []);
        setClientTasks(clientResult.data || []);
        setEmails(emailsResult.data || []);
        setDocuments(docsResult.data || []);
      } else {
        // Fetch from stage_* template tables
        const [teamResult, clientResult, emailsResult, docsResult] = await Promise.all([
          supabase
            .from('stage_team_tasks')
            .select('*')
            .eq('stage_id', stageId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('stage_client_tasks')
            .select('*')
            .eq('stage_id', stageId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('stage_emails')
            .select(`*, email_template:email_templates(id, internal_name, subject, html_body)`)
            .eq('stage_id', stageId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('stage_documents')
            .select(`*, document:documents(id, title, is_auto_generated, is_tenant_downloadable)`)
            .eq('stage_id', stageId)
            .order('sort_order', { ascending: true })
        ]);

        setTeamTasks(teamResult.data || []);
        setClientTasks(clientResult.data || []);
        setEmails(emailsResult.data || []);
        setDocuments(docsResult.data || []);
      }
    } catch (error: any) {
      console.error('Failed to fetch resolved content:', error);
      toast({
        title: 'Error',
        description: 'Failed to load stage content',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [packageId, stageId, toast]);

  useEffect(() => {
    fetchResolvedContent();
  }, [fetchResolvedContent]);

  return {
    teamTasks,
    clientTasks,
    emails,
    documents,
    loading,
    source,
    refetch: fetchResolvedContent
  };
}
