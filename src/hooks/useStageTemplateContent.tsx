import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Types for stage template content (mapped from base tables)
export interface StageTeamTask {
  id: number;
  stage_id: number;
  name: string;
  description: string | null;
  sort_order: number;
  owner_role: string;
  estimated_hours: number | null;
  is_mandatory: boolean;
  is_core: boolean;
  is_recurring: boolean;
  due_date_offset: number | null;
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
}

export interface StageEmail {
  id: number;
  stage_id: number;
  order_number: number | null;
  name: string;
  description: string | null;
  subject: string;
  content: string | null;
  to: string | null;
  package_id: number | null;
  automation_enabled: boolean;
  created_at: string | null;
  created_by: string | null;
}

export interface StageDocument {
  id: number;
  stage: number;
  title: string;
  description: string | null;
  format: string | null;
  category: string | null;
  is_team_only: boolean;
  is_tenant_downloadable: boolean;
  is_auto_generated: boolean;
  is_released: boolean;
  document_status: string | null;
  ai_status: string | null;
  ai_confidence_score: number | null;
  ai_category_confidence: number | null;
  ai_description_confidence: number | null;
  ai_reasoning: string | null;
  created_at: string | null;
}

/**
 * Hook to manage stage template content (global stage content)
 * Queries from base tables: staff_tasks, client_tasks, emails, documents
 */
export function useStageTemplateContent(stageId: number | null) {
  const { toast } = useToast();
  const [teamTasks, setTeamTasks] = useState<StageTeamTask[]>([]);
  const [clientTasks, setClientTasks] = useState<StageClientTask[]>([]);
  const [emails, setEmails] = useState<StageEmail[]>([]);
  const [documents, setDocuments] = useState<StageDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all stage template content from base tables
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
          .from('staff_tasks')
          .select('*')
          .eq('stage_id', stageId)
          .order('order_number', { ascending: true }),
        supabase
          .from('client_tasks')
          .select('*')
          .eq('stage_id', stageId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('emails')
          .select('*')
          .eq('stage_id', stageId)
          .order('order_number', { ascending: true }),
        supabase
          .from('documents')
          .select('*')
          .eq('stage', stageId)
          .order('title', { ascending: true })
      ]);

      if (teamResult.error) throw teamResult.error;
      if (clientResult.error) throw clientResult.error;
      if (emailsResult.error) throw emailsResult.error;
      if (docsResult.error) throw docsResult.error;

      // Map staff_tasks to StageTeamTask shape
      setTeamTasks((teamResult.data || []).map((t: any) => ({
        id: t.id,
        stage_id: t.stage_id,
        name: t.name,
        description: t.description,
        sort_order: t.order_number ?? 0,
        owner_role: 'Admin',
        estimated_hours: null,
        is_mandatory: true,
        is_core: t.is_core ?? true,
        is_recurring: t.is_recurring ?? false,
        due_date_offset: t.due_date_offset,
      })));
      setClientTasks((clientResult.data || []) as unknown as StageClientTask[]);
      setEmails((emailsResult.data || []) as unknown as StageEmail[]);
      setDocuments((docsResult.data || []) as unknown as StageDocument[]);
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

  // Team Task CRUD (staff_tasks table)
  const addTeamTask = async (data: Partial<StageTeamTask>) => {
    if (!stageId) return;

    const maxOrder = teamTasks.reduce((max, t) => Math.max(max, t.sort_order), -1);
    
    const { error } = await supabase
      .from('staff_tasks')
      .insert({
        stage_id: stageId,
        name: data.name,
        description: data.description || null,
        order_number: maxOrder + 1,
        is_core: data.is_core ?? true,
        is_recurring: data.is_recurring ?? false,
        due_date_offset: data.due_date_offset || null
      } as any);

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId.toString(),
      action: 'stage.template_updated',
      details: { change_type: 'team_task_added', task_name: data.name }
    });

    await fetchContent();
  };

  const updateTeamTask = async (taskId: number, data: Partial<Omit<StageTeamTask, 'id'>>) => {
    // Map sort_order back to order_number for staff_tasks
    const updateData: any = { ...data };
    if ('sort_order' in updateData) {
      updateData.order_number = updateData.sort_order;
      delete updateData.sort_order;
    }
    // Remove fields not in staff_tasks
    delete updateData.owner_role;
    delete updateData.estimated_hours;
    delete updateData.is_mandatory;

    const { error } = await supabase
      .from('staff_tasks')
      .update(updateData)
      .eq('id', taskId);

    if (error) throw error;

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
      .from('staff_tasks')
      .delete()
      .eq('id', taskId);

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId?.toString() || '',
      action: 'stage.template_updated',
      details: { change_type: 'team_task_deleted', task_name: task?.name }
    });

    await fetchContent();
  };

  // Client Task CRUD (client_tasks table)
  const addClientTask = async (data: Partial<StageClientTask>) => {
    if (!stageId) return;

    const maxOrder = clientTasks.reduce((max, t) => Math.max(max, t.sort_order), -1);
    
    const { error } = await supabase
      .from('client_tasks')
      .insert({
        stage_id: stageId,
        name: data.name!,
        description: data.description || null,
        sort_order: maxOrder + 1,
        instructions: data.instructions || null,
        is_mandatory: data.is_mandatory ?? true,
        due_date_offset: data.due_date_offset || null
      } as any);

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
      .from('client_tasks')
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
      .from('client_tasks')
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

  // Email CRUD (emails table)
  const addEmail = async (emailTemplateIdOrName: string, triggerTypeOrSubject: string, recipientTypeOrContent: string) => {
    if (!stageId) return;

    const maxOrder = emails.reduce((max, e) => Math.max(max, e.order_number ?? 0), -1);
    
    const { error } = await supabase
      .from('emails')
      .insert({
        stage_id: stageId,
        name: emailTemplateIdOrName,
        subject: triggerTypeOrSubject,
        content: recipientTypeOrContent,
        order_number: maxOrder + 1,
      } as any);

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId.toString(),
      action: 'stage.template_updated',
      details: { change_type: 'email_added', email_name: emailTemplateIdOrName }
    });

    await fetchContent();
  };

  const updateEmail = async (emailId: number, data: Partial<Omit<StageEmail, 'id'>>) => {
    const { error } = await supabase
      .from('emails')
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
      .from('emails')
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

  // Document CRUD (documents table - stage column)
  const addDocument = async (documentId: number) => {
    // Documents are linked by setting stage = stageId on existing document records
    if (!stageId) return;

    const { error } = await supabase
      .from('documents')
      .update({ stage: stageId })
      .eq('id', documentId);

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId.toString(),
      action: 'stage.template_updated',
      details: { change_type: 'document_linked', document_id: documentId }
    });

    await fetchContent();
  };

  const addBulkDocuments = async (documentIds: number[]) => {
    if (!stageId || documentIds.length === 0) return;

    for (const docId of documentIds) {
      const { error } = await supabase
        .from('documents')
        .update({ stage: stageId })
        .eq('id', docId);

      if (error) throw error;
    }

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId.toString(),
      action: 'stage.template_updated',
      details: { change_type: 'documents_bulk_linked', document_ids: documentIds }
    });

    await fetchContent();
  };

  const updateDocument = async (docId: number, data: Record<string, any>) => {
    const { error } = await supabase
      .from('documents')
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
    // Unlink from stage by setting stage to null
    const { error } = await supabase
      .from('documents')
      .update({ stage: null })
      .eq('id', docId);

    if (error) throw error;

    await supabase.from('audit_events').insert({
      entity: 'stage',
      entity_id: stageId?.toString() || '',
      action: 'stage.template_updated',
      details: { change_type: 'document_unlinked', document_id: docId }
    });

    await fetchContent();
  };

  const reorderDocuments = async (_orderedIds: number[]) => {
    // Documents table doesn't have sort_order - they're ordered by title
    // This is a no-op for now
    return;
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
      // Fetch template content from base tables
      const [teamTasks, clientTasks, emailsData, docs] = await Promise.all([
        supabase.from('staff_tasks').select('*').eq('stage_id', stageId),
        supabase.from('client_tasks').select('*').eq('stage_id', stageId),
        supabase.from('emails').select('*').eq('stage_id', stageId),
        supabase.from('documents').select('*').eq('stage', stageId)
      ]);

      // Copy team tasks
      if (teamTasks.data && teamTasks.data.length > 0) {
        const inserts = teamTasks.data.map((t: any) => ({
          package_id: packageId,
          stage_id: stageId,
          name: t.name,
          description: t.description,
          order_number: t.order_number,
          is_mandatory: true
        }));
        await supabase.from('package_staff_tasks').insert(inserts);
      }

      // Copy client tasks
      if (clientTasks.data && clientTasks.data.length > 0) {
        const inserts = clientTasks.data.map((t: any) => ({
          package_id: packageId,
          stage_id: stageId,
          name: t.name,
          description: t.description,
          order_number: t.sort_order,
          instructions: t.instructions,
          due_date_offset: t.due_date_offset
        }));
        await supabase.from('package_client_tasks').insert(inserts);
      }

      // Copy emails
      if (emailsData.data && emailsData.data.length > 0) {
        const inserts = emailsData.data.map((e: any) => ({
          package_id: packageId,
          stage_id: stageId,
          name: e.name,
          subject: e.subject,
          content: e.content,
          sort_order: e.order_number,
          is_active: true
        }));
        await supabase.from('package_stage_emails').insert(inserts as any);
      }

      // Copy documents
      if (docs.data && docs.data.length > 0) {
        const inserts = docs.data.map((d: any) => ({
          package_id: packageId,
          stage_id: stageId,
          document_id: d.id,
          sort_order: 0
        }));
        await supabase.from('package_stage_documents').insert(inserts);
      }

      // Enable overrides
      await supabase
        .from('package_stages')
        .update({ use_overrides: true })
        .eq('package_id', packageId)
        .eq('stage_id', stageId);

      await supabase.from('package_builder_audit_log').insert({
        package_id: packageId,
        action: 'stage.override_copied_from_template',
        entity_type: 'package_stage',
        entity_id: stageId.toString(),
        after_data: {
          team_tasks: teamTasks.data?.length || 0,
          client_tasks: clientTasks.data?.length || 0,
          emails: emailsData.data?.length || 0,
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
      await Promise.all([
        supabase.from('package_staff_tasks').delete().eq('package_id', packageId).eq('stage_id', stageId),
        supabase.from('package_client_tasks').delete().eq('package_id', packageId).eq('stage_id', stageId),
        supabase.from('package_stage_emails').delete().eq('package_id', packageId).eq('stage_id', stageId),
        supabase.from('package_stage_documents').delete().eq('package_id', packageId).eq('stage_id', stageId)
      ]);

      await supabase
        .from('package_stages')
        .update({ use_overrides: false })
        .eq('package_id', packageId)
        .eq('stage_id', stageId);

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
        // Fetch from base tables
        const [teamResult, clientResult, emailsResult, docsResult] = await Promise.all([
          supabase
            .from('staff_tasks')
            .select('*')
            .eq('stage_id', stageId)
            .order('order_number', { ascending: true }),
          supabase
            .from('client_tasks')
            .select('*')
            .eq('stage_id', stageId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('emails')
            .select('*')
            .eq('stage_id', stageId)
            .order('order_number', { ascending: true }),
          supabase
            .from('documents')
            .select('*')
            .eq('stage', stageId)
            .order('title', { ascending: true })
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
