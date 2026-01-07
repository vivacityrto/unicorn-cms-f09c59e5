import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Package {
  id: number;
  name: string;
  full_text: string;
  details: string;
  status: string;
  slug: string | null;
  created_at: string;
  duration_months: number | null;
  package_type: string | null;
  total_hours: number | null;
  progress_mode: string | null;
  stages_count?: number;
}

export interface Stage {
  id: number;
  title: string;
  short_name: string | null;
  description: string | null;
  video_url: string | null;
  stage_type: string;
  is_reusable: boolean;
  ai_hint: string | null;
  dashboard_visible: boolean;
  created_at: string;
  usage_count?: number;
  is_certified?: boolean;
  certified_notes?: string | null;
  stage_key: string;
  version_label?: string | null;
  requires_stage_keys?: string[] | null;
  frameworks?: string[] | null;
}

export interface PackageStage {
  id: number;
  package_id: number;
  stage_id: number;
  sort_order: number;
  is_required: boolean;
  dashboard_group: string | null;
  stage?: Stage;
}

export interface StaffTask {
  id: string;
  package_id: number;
  stage_id: number;
  name: string;
  description: string | null;
  due_date_offset: number | null;
  order_number: number;
  owner_role: string;
  estimated_hours: number | null;
  is_mandatory: boolean;
}

export interface ClientTask {
  id: string;
  package_id: number;
  stage_id: number;
  name: string;
  description: string | null;
  instructions: string | null;
  due_date_offset: number | null;
  order_number: number;
  required_documents: string[] | null;
}

export interface StageEmail {
  id: number;
  package_id: number;
  stage_id: number;
  email_template_id: string;
  trigger_type: 'on_stage_start' | 'on_task_complete' | 'manual';
  recipient_type: 'internal' | 'tenant' | 'both';
  sort_order: number;
  is_active: boolean;
  email_template?: {
    id: string;
    internal_name: string;
    subject: string;
    description: string;
  };
}

export interface EmailTemplate {
  id: string;
  internal_name: string;
  subject: string;
  description: string;
}

export function usePackageBuilder() {
  const { toast } = useToast();
  const [packages, setPackages] = useState<Package[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPackages = useCallback(async () => {
    try {
      const [packagesResult, stageCounts] = await Promise.all([
        supabase.from('packages').select('*').order('created_at', { ascending: false }),
        supabase.from('package_stages' as any).select('package_id') as any
      ]);

      if (packagesResult.error) throw packagesResult.error;

      const countMap = new Map<number, number>();
      ((stageCounts.data || []) as any[]).forEach((stage: any) => {
        countMap.set(stage.package_id, (countMap.get(stage.package_id) || 0) + 1);
      });

      const packagesWithCounts = (packagesResult.data || []).map(pkg => ({
        ...pkg,
        stages_count: countMap.get(pkg.id) || 0
      }));

      setPackages(packagesWithCounts);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch packages',
        variant: 'destructive'
      });
    }
  }, [toast]);

  const fetchStages = useCallback(async () => {
    try {
      // Get stages with usage count
      const [stagesResult, usageCounts] = await Promise.all([
        supabase.from('documents_stages').select('*').order('title', { ascending: true }),
        supabase.from('package_stages' as any).select('stage_id') as any
      ]);

      if (stagesResult.error) throw stagesResult.error;

      const countMap = new Map<number, number>();
      ((usageCounts.data || []) as any[]).forEach((ps: any) => {
        countMap.set(ps.stage_id, (countMap.get(ps.stage_id) || 0) + 1);
      });

      const stagesWithCounts = (stagesResult.data || []).map(stage => ({
        ...stage,
        is_reusable: stage.is_reusable ?? true,
        usage_count: countMap.get(stage.id) || 0
      }));

      setStages(stagesWithCounts);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch stages',
        variant: 'destructive'
      });
    }
  }, [toast]);

  const fetchEmailTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('id, internal_name, subject, description')
        .order('internal_name', { ascending: true });

      if (error) throw error;
      setEmailTemplates(data || []);
    } catch (error: any) {
      console.error('Failed to fetch email templates:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPackages(), fetchStages(), fetchEmailTemplates()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPackages, fetchStages, fetchEmailTemplates]);

  const createPackage = async (data: Partial<Package>) => {
    const { data: newPackage, error } = await supabase
      .from('packages')
      .insert({
        name: data.name,
        full_text: data.full_text,
        details: data.details,
        status: data.status || 'active',
        duration_months: data.duration_months,
        package_type: data.package_type,
        total_hours: data.total_hours
      })
      .select()
      .single();

    if (error) throw error;
    await fetchPackages();
    return newPackage;
  };

  const updatePackage = async (id: number, data: Partial<Package>) => {
    const { id: _id, ...updateData } = data as any;
    const { error } = await supabase
      .from('packages')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
    await fetchPackages();
  };

  const duplicatePackage = async (packageId: number) => {
    // Get the original package
    const { data: original, error: fetchError } = await supabase
      .from('packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (fetchError) throw fetchError;

    // Create new package with "(Copy)" suffix
    const { data: newPackage, error: createError } = await supabase
      .from('packages')
      .insert({
        name: `${original.name} (Copy)`,
        full_text: `${original.full_text} (Copy)`,
        details: original.details,
        status: 'inactive',
        duration_months: original.duration_months,
        package_type: original.package_type,
        total_hours: original.total_hours,
        progress_mode: original.progress_mode
      })
      .select()
      .single();

    if (createError) throw createError;

    // Copy package stages
    const { data: originalStages } = await (supabase
      .from('package_stages' as any)
      .select('*')
      .eq('package_id', packageId) as any);

    if (originalStages && originalStages.length > 0) {
      const newStages = originalStages.map((stage: any) => ({
        package_id: newPackage.id,
        stage_id: stage.stage_id,
        sort_order: stage.sort_order,
        is_required: stage.is_required,
        dashboard_group: stage.dashboard_group
      }));

      await (supabase.from('package_stages' as any).insert(newStages) as any);
    }

    // Copy staff tasks
    const { data: originalStaffTasks } = await supabase
      .from('package_staff_tasks')
      .select('*')
      .eq('package_id', packageId);

    if (originalStaffTasks && originalStaffTasks.length > 0) {
      const newTasks = originalStaffTasks.map(task => ({
        package_id: newPackage.id,
        stage_id: task.stage_id,
        name: task.name,
        description: task.description,
        due_date_offset: task.due_date_offset,
        order_number: task.order_number,
        owner_role: (task as any).owner_role,
        estimated_hours: (task as any).estimated_hours,
        is_mandatory: (task as any).is_mandatory
      }));

      await supabase.from('package_staff_tasks').insert(newTasks);
    }

    // Copy client tasks
    const { data: originalClientTasks } = await supabase
      .from('package_client_tasks')
      .select('*')
      .eq('package_id', packageId);

    if (originalClientTasks && originalClientTasks.length > 0) {
      const newTasks = originalClientTasks.map(task => ({
        package_id: newPackage.id,
        stage_id: task.stage_id,
        name: task.name,
        description: task.description,
        due_date_offset: task.due_date_offset,
        order_number: task.order_number,
        instructions: (task as any).instructions,
        required_documents: (task as any).required_documents
      }));

      await supabase.from('package_client_tasks').insert(newTasks);
    }

    await fetchPackages();
    return newPackage;
  };

  const archivePackage = async (packageId: number) => {
    const { error } = await supabase
      .from('packages')
      .update({ status: 'archived' })
      .eq('id', packageId);

    if (error) throw error;
    await fetchPackages();
  };

  const deletePackage = async (packageId: number) => {
    const { error } = await supabase
      .from('packages')
      .delete()
      .eq('id', packageId);

    if (error) throw error;
    await fetchPackages();
  };

  const createStage = async (data: Partial<Stage>) => {
    // Generate stage_key from title
    const stageKey = (data.title || 'stage').toLowerCase()
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '-' + Date.now();
    
    const { data: newStage, error } = await supabase
      .from('documents_stages')
      .insert({
        title: data.title,
        short_name: data.short_name,
        description: data.description,
        video_url: data.video_url,
        stage_type: data.stage_type || 'delivery',
        is_reusable: data.is_reusable ?? true,
        ai_hint: data.ai_hint,
        dashboard_visible: data.dashboard_visible ?? true,
        is_certified: data.is_certified ?? false,
        certified_notes: data.is_certified ? data.certified_notes : null,
        stage_key: stageKey
      })
      .select()
      .single();

    if (error) throw error;
    await fetchStages();
    return newStage;
  };

  const updateStage = async (id: number, data: Partial<Stage>) => {
    const { id: _id, ...updateData } = data as any;
    // If updating certified status to false, clear notes
    if (updateData.is_certified === false) {
      updateData.certified_notes = null;
    }
    const { error } = await supabase
      .from('documents_stages')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
    await fetchStages();
  };

  return {
    packages,
    stages,
    emailTemplates,
    loading,
    fetchPackages,
    fetchStages,
    createPackage,
    updatePackage,
    duplicatePackage,
    archivePackage,
    deletePackage,
    createStage,
    updateStage
  };
}

export function usePackageDetail(packageId: number | null) {
  const { toast } = useToast();
  const [packageData, setPackageData] = useState<Package | null>(null);
  const [packageStages, setPackageStages] = useState<PackageStage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPackageData = useCallback(async () => {
    if (!packageId) return;

    try {
      const { data, error } = await supabase
        .from('packages')
        .select('*')
        .eq('id', packageId)
        .single();

      if (error) throw error;
      setPackageData(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch package',
        variant: 'destructive'
      });
    }
  }, [packageId, toast]);

  const fetchPackageStages = useCallback(async () => {
    if (!packageId) return;

    try {
      // Fetch package stages with stage details
      const { data: psData, error: psError } = await (supabase
        .from('package_stages' as any)
        .select('*')
        .eq('package_id', packageId)
        .order('sort_order', { ascending: true }) as any);

      if (psError) throw psError;

      // Fetch stage details for each
      const stageIds = (psData || []).map((ps: any) => ps.stage_id);
      
      if (stageIds.length > 0) {
        const { data: stageData, error: stageError } = await supabase
          .from('documents_stages')
          .select('*')
          .in('id', stageIds);

        if (stageError) throw stageError;

        const stageMap = new Map((stageData || []).map(s => [s.id, s]));
        
        const enrichedStages = (psData || []).map((ps: any) => ({
          ...ps,
          stage: stageMap.get(ps.stage_id)
        }));

        setPackageStages(enrichedStages);
      } else {
        setPackageStages([]);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch package stages',
        variant: 'destructive'
      });
    }
  }, [packageId, toast]);

  useEffect(() => {
    const loadData = async () => {
      if (!packageId) return;
      setLoading(true);
      await Promise.all([fetchPackageData(), fetchPackageStages()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPackageData, fetchPackageStages, packageId]);

  const addStageToPackage = async (stageId: number) => {
    if (!packageId) return;

    const maxOrder = packageStages.reduce((max, ps) => Math.max(max, ps.sort_order), -1);

    const { error } = await (supabase
      .from('package_stages' as any)
      .insert({
        package_id: packageId,
        stage_id: stageId,
        sort_order: maxOrder + 1,
        is_required: true
      }) as any);

    if (error) throw error;
    await fetchPackageStages();
  };

  const removeStageFromPackage = async (packageStageId: number) => {
    const { error } = await (supabase
      .from('package_stages' as any)
      .delete()
      .eq('id', packageStageId) as any);

    if (error) throw error;
    await fetchPackageStages();
  };

  const reorderStages = async (stageIds: number[]) => {
    if (!packageId) return;

    const updates = stageIds.map((id, index) => 
      (supabase
        .from('package_stages' as any)
        .update({ sort_order: index })
        .eq('id', id) as any)
    );

    await Promise.all(updates);
    await fetchPackageStages();
  };

  const updatePackageData = async (data: Partial<Package>) => {
    if (!packageId) return;

    const { id: _id, ...updateData } = data as any;
    const { error } = await supabase
      .from('packages')
      .update(updateData)
      .eq('id', packageId);

    if (error) throw error;
    await fetchPackageData();
  };

  return {
    packageData,
    packageStages,
    loading,
    fetchPackageData,
    fetchPackageStages,
    addStageToPackage,
    removeStageFromPackage,
    reorderStages,
    updatePackageData
  };
}

export function useStageDetail(packageId: number | null, stageId: number | null) {
  const { toast } = useToast();
  const [staffTasks, setStaffTasks] = useState<StaffTask[]>([]);
  const [clientTasks, setClientTasks] = useState<ClientTask[]>([]);
  const [stageEmails, setStageEmails] = useState<StageEmail[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStageData = useCallback(async () => {
    if (!packageId || !stageId) return;

    try {
      const [staffResult, clientResult, emailsResult, docsResult] = await Promise.all([
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
          .from('package_stage_emails' as any)
          .select('*')
          .eq('package_id', packageId)
          .eq('stage_id', stageId)
          .order('sort_order', { ascending: true }) as any,
        supabase
          .from('documents')
          .select('*')
          .eq('package_id', packageId)
          .eq('stage', stageId)
          .order('id', { ascending: true })
      ]);

      setStaffTasks((staffResult.data || []) as StaffTask[]);
      setClientTasks((clientResult.data || []) as ClientTask[]);
      setStageEmails((emailsResult.data || []) as StageEmail[]);
      setDocuments(docsResult.data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch stage data',
        variant: 'destructive'
      });
    }
  }, [packageId, stageId, toast]);

  useEffect(() => {
    const loadData = async () => {
      if (!packageId || !stageId) return;
      setLoading(true);
      await fetchStageData();
      setLoading(false);
    };
    loadData();
  }, [fetchStageData, packageId, stageId]);

  const addStaffTask = async (data: Partial<StaffTask>) => {
    if (!packageId || !stageId) return;

    const maxOrder = staffTasks.reduce((max, t) => Math.max(max, t.order_number), -1);

    const { error } = await supabase
      .from('package_staff_tasks')
      .insert({
        package_id: packageId,
        stage_id: stageId,
        name: data.name,
        description: data.description,
        due_date_offset: data.due_date_offset,
        order_number: maxOrder + 1,
        owner_role: data.owner_role || 'Admin',
        estimated_hours: data.estimated_hours,
        is_mandatory: data.is_mandatory ?? true
      });

    if (error) throw error;
    await fetchStageData();
  };

  const updateStaffTask = async (taskId: string, data: Partial<StaffTask>) => {
    const { error } = await supabase
      .from('package_staff_tasks')
      .update(data)
      .eq('id', taskId);

    if (error) throw error;
    await fetchStageData();
  };

  const deleteStaffTask = async (taskId: string) => {
    const { error } = await supabase
      .from('package_staff_tasks')
      .delete()
      .eq('id', taskId);

    if (error) throw error;
    await fetchStageData();
  };

  const addClientTask = async (data: Partial<ClientTask>) => {
    if (!packageId || !stageId) return;

    const maxOrder = clientTasks.reduce((max, t) => Math.max(max, t.order_number), -1);

    const insertData: any = {
      package_id: packageId,
      stage_id: stageId,
      name: data.name,
      description: data.description || null,
      order_number: maxOrder + 1
    };

    // Only add optional fields if they exist in the table
    if (data.instructions !== undefined) insertData.instructions = data.instructions;
    if (data.due_date_offset !== undefined) insertData.due_date_offset = data.due_date_offset;
    if (data.required_documents !== undefined) insertData.required_documents = data.required_documents;

    const { error } = await supabase
      .from('package_client_tasks')
      .insert(insertData);

    if (error) throw error;
    await fetchStageData();
  };

  const updateClientTask = async (taskId: string, data: Partial<ClientTask>) => {
    const { error } = await supabase
      .from('package_client_tasks')
      .update(data)
      .eq('id', taskId);

    if (error) throw error;
    await fetchStageData();
  };

  const deleteClientTask = async (taskId: string) => {
    const { error } = await supabase
      .from('package_client_tasks')
      .delete()
      .eq('id', taskId);

    if (error) throw error;
    await fetchStageData();
  };

  const addStageEmail = async (emailTemplateId: string, triggerType: string, recipientType: string) => {
    if (!packageId || !stageId) return;

    const maxOrder = stageEmails.reduce((max, e) => Math.max(max, e.sort_order), -1);

    const { error } = await (supabase
      .from('package_stage_emails' as any)
      .insert({
        package_id: packageId,
        stage_id: stageId,
        email_template_id: emailTemplateId,
        trigger_type: triggerType,
        recipient_type: recipientType,
        sort_order: maxOrder + 1,
        is_active: true
      }) as any);

    if (error) throw error;
    await fetchStageData();
  };

  const removeStageEmail = async (emailId: number) => {
    const { error } = await (supabase
      .from('package_stage_emails' as any)
      .delete()
      .eq('id', emailId) as any);

    if (error) throw error;
    await fetchStageData();
  };

  // Stage document functions
  const [stageDocuments, setStageDocuments] = useState<StageDocument[]>([]);

  const fetchStageDocuments = useCallback(async () => {
    if (!packageId || !stageId) return;

    const { data, error } = await supabase
      .from('package_stage_documents' as any)
      .select(`
        *,
        document:documents(id, title, format, category, is_team_only, is_tenant_downloadable, is_auto_generated)
      `)
      .eq('package_id', packageId)
      .eq('stage_id', stageId)
      .order('sort_order', { ascending: true }) as any;

    if (error) {
      console.error('Error fetching stage documents:', error);
      return;
    }
    setStageDocuments(data || []);
  }, [packageId, stageId]);

  useEffect(() => {
    if (packageId && stageId) {
      fetchStageDocuments();
    }
  }, [fetchStageDocuments, packageId, stageId]);

  const addStageDocument = async (documentId: number, visibility: string = 'both', deliveryType: string = 'manual') => {
    if (!packageId || !stageId) return;

    const maxOrder = stageDocuments.reduce((max, d) => Math.max(max, d.sort_order), -1);

    const { error } = await (supabase
      .from('package_stage_documents' as any)
      .insert({
        package_id: packageId,
        stage_id: stageId,
        document_id: documentId,
        visibility,
        delivery_type: deliveryType,
        sort_order: maxOrder + 1
      }) as any);

    if (error) {
      if (error.code === '23505') {
        throw new Error('This document is already linked to this stage');
      }
      throw error;
    }

    // Log to audit
    await (supabase
      .from('package_builder_audit_log' as any)
      .insert({
        package_id: packageId,
        action: 'link',
        entity_type: 'stage_document',
        entity_id: documentId.toString(),
        after_data: { stage_id: stageId, document_id: documentId, visibility, delivery_type: deliveryType }
      }) as any);

    await fetchStageDocuments();
  };

  const addBulkStageDocuments = async (documentIds: number[], visibility: string = 'both', deliveryType: string = 'manual') => {
    if (!packageId || !stageId || documentIds.length === 0) return;

    const startOrder = stageDocuments.reduce((max, d) => Math.max(max, d.sort_order), -1) + 1;

    const inserts = documentIds.map((docId, idx) => ({
      package_id: packageId,
      stage_id: stageId,
      document_id: docId,
      visibility,
      delivery_type: deliveryType,
      sort_order: startOrder + idx
    }));

    const { error } = await (supabase
      .from('package_stage_documents' as any)
      .insert(inserts) as any);

    if (error) {
      if (error.code === '23505') {
        throw new Error('One or more documents are already linked to this stage');
      }
      throw error;
    }

    // Log to audit
    await (supabase
      .from('package_builder_audit_log' as any)
      .insert({
        package_id: packageId,
        action: 'bulk_link',
        entity_type: 'stage_documents',
        entity_id: stageId.toString(),
        after_data: { stage_id: stageId, document_ids: documentIds, count: documentIds.length }
      }) as any);

    await fetchStageDocuments();
  };

  const updateStageDocument = async (id: string, data: { visibility?: string; delivery_type?: string }) => {
    // Get before state for audit
    const existing = stageDocuments.find(d => d.id === id);
    
    const { error } = await (supabase
      .from('package_stage_documents' as any)
      .update(data)
      .eq('id', id) as any);

    if (error) throw error;

    // Log to audit
    await (supabase
      .from('package_builder_audit_log' as any)
      .insert({
        package_id: packageId,
        action: 'update',
        entity_type: 'stage_document',
        entity_id: id,
        before_data: existing ? { visibility: existing.visibility, delivery_type: existing.delivery_type } : null,
        after_data: data
      }) as any);

    await fetchStageDocuments();
  };

  const removeStageDocument = async (id: string, documentId: number) => {
    const { error } = await (supabase
      .from('package_stage_documents' as any)
      .delete()
      .eq('id', id) as any);

    if (error) throw error;

    // Log to audit
    await (supabase
      .from('package_builder_audit_log' as any)
      .insert({
        package_id: packageId,
        action: 'unlink',
        entity_type: 'stage_document',
        entity_id: documentId.toString(),
        before_data: { stage_id: stageId, document_id: documentId }
      }) as any);

    await fetchStageDocuments();
  };

  const reorderStageDocuments = async (orderedIds: string[]) => {
    if (!packageId || !stageId) return;

    const updates = orderedIds.map((id, index) => ({
      id,
      sort_order: index
    }));

    for (const update of updates) {
      await (supabase
        .from('package_stage_documents' as any)
        .update({ sort_order: update.sort_order })
        .eq('id', update.id) as any);
    }

    // Log to audit
    await (supabase
      .from('package_builder_audit_log' as any)
      .insert({
        package_id: packageId,
        action: 'reorder',
        entity_type: 'stage_documents',
        entity_id: stageId.toString(),
        after_data: { new_order: orderedIds }
      }) as any);

    await fetchStageDocuments();
  };

  return {
    staffTasks,
    clientTasks,
    stageEmails,
    documents,
    stageDocuments,
    loading,
    fetchStageData,
    addStaffTask,
    updateStaffTask,
    deleteStaffTask,
    addClientTask,
    updateClientTask,
    deleteClientTask,
    addStageEmail,
    removeStageEmail,
    addStageDocument,
    addBulkStageDocuments,
    updateStageDocument,
    removeStageDocument,
    reorderStageDocuments
  };
}

// Type for stage document with joined document data
export interface StageDocument {
  id: string;
  package_id: number;
  stage_id: number;
  document_id: number;
  visibility: 'team_only' | 'tenant_download' | 'both';
  delivery_type: 'manual' | 'auto_generate';
  sort_order: number;
  created_at: string;
  updated_at: string;
  document: {
    id: number;
    title: string;
    format: string | null;
    category: string | null;
    is_team_only: boolean | null;
    is_tenant_downloadable: boolean | null;
    is_auto_generated: boolean | null;
  };
}