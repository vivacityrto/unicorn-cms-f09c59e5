import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Stage } from '@/hooks/usePackageBuilder';

export interface StageExportData {
  version: '1.0';
  exported_at: string;
  package_context?: {
    package_id: number;
    package_name: string;
  };
  stage: {
    title: string;
    short_name: string | null;
    description: string | null;
    stage_type: string;
    video_url: string | null;
    ai_hint: string | null;
    is_reusable: boolean;
    dashboard_visible: boolean;
    is_certified: boolean;
    certified_notes: string | null;
  };
  team_tasks: Array<{
    name: string;
    description: string | null;
    owner_role: string;
    estimated_hours: number | null;
    is_mandatory: boolean;
    order_number: number;
  }>;
  client_tasks: Array<{
    name: string;
    description: string | null;
    instructions: string | null;
    due_date_offset: number | null;
    order_number: number;
  }>;
  emails: Array<{
    email_template_id: string;
    trigger_type: string;
    recipient_type: string;
    sort_order: number;
    is_active: boolean;
  }>;
  documents: Array<{
    document_id: number;
    visibility: string;
    delivery_type: string;
    sort_order: number;
  }>;
}

interface ImportResult {
  success: boolean;
  newStageId?: number;
  error?: string;
  counts?: {
    team_tasks: number;
    client_tasks: number;
    emails: number;
    documents: number;
  };
}

export function useStageExportImport() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();

  const exportStage = async (
    stageId: number,
    packageId?: number
  ): Promise<StageExportData | null> => {
    setIsExporting(true);

    try {
      // Fetch stage
      const { data: stage, error: stageError } = await supabase
        .from('documents_stages')
        .select('*')
        .eq('id', stageId)
        .single();

      if (stageError || !stage) {
        throw new Error('Stage not found');
      }

      let teamTasks: any[] = [];
      let clientTasks: any[] = [];
      let emails: any[] = [];
      let documents: any[] = [];
      let packageContext: { package_id: number; package_name: string } | undefined;

      if (packageId) {
        // Fetch package name
        const { data: pkg } = await supabase
          .from('packages')
          .select('name')
          .eq('id', packageId)
          .single();

        packageContext = pkg ? { package_id: packageId, package_name: pkg.name } : undefined;

        // Fetch package-context data
        const [staffResult, clientResult, emailsResult, docsResult] = await Promise.all([
          supabase
            .from('package_staff_tasks')
            .select('*')
            .eq('package_id', packageId)
            .eq('stage_id', stageId)
            .order('order_number'),
          supabase
            .from('package_client_tasks')
            .select('*')
            .eq('package_id', packageId)
            .eq('stage_id', stageId)
            .order('order_number'),
          supabase
            .from('package_stage_emails' as any)
            .select('*')
            .eq('package_id', packageId)
            .eq('stage_id', stageId)
            .order('sort_order') as any,
          supabase
            .from('package_stage_documents' as any)
            .select('*')
            .eq('package_id', packageId)
            .eq('stage_id', stageId)
            .order('sort_order') as any,
        ]);

        teamTasks = staffResult.data || [];
        clientTasks = clientResult.data || [];
        emails = emailsResult.data || [];
        documents = docsResult.data || [];
      }

      const exportData: StageExportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        package_context: packageContext,
        stage: {
          title: stage.title,
          short_name: stage.short_name,
          description: stage.description,
          stage_type: stage.stage_type,
          video_url: stage.video_url,
          ai_hint: stage.ai_hint,
          is_reusable: stage.is_reusable ?? true,
          dashboard_visible: stage.dashboard_visible ?? true,
          is_certified: stage.is_certified ?? false,
          certified_notes: stage.certified_notes,
        },
        team_tasks: teamTasks.map(t => ({
          name: t.name,
          description: t.description,
          owner_role: t.owner_role,
          estimated_hours: t.estimated_hours,
          is_mandatory: t.is_mandatory,
          order_number: t.order_number,
        })),
        client_tasks: clientTasks.map(t => ({
          name: t.name,
          description: t.description,
          instructions: t.instructions,
          due_date_offset: t.due_date_offset,
          order_number: t.order_number,
        })),
        emails: emails.map(e => ({
          email_template_id: e.email_template_id,
          trigger_type: e.trigger_type,
          recipient_type: e.recipient_type,
          sort_order: e.sort_order,
          is_active: e.is_active,
        })),
        documents: documents.map(d => ({
          document_id: d.document_id,
          visibility: d.visibility,
          delivery_type: d.delivery_type,
          sort_order: d.sort_order,
        })),
      };

      // Log export
      await supabase.from('audit_events').insert({
        entity: 'stage',
        entity_id: stageId.toString(),
        action: 'stage.exported',
        details: {
          package_id: packageId || null,
          task_count: teamTasks.length + clientTasks.length,
          email_count: emails.length,
          document_count: documents.length,
        },
      });

      return exportData;
    } catch (error: any) {
      console.error('Export failed:', error);
      toast({
        title: 'Export Failed',
        description: error.message || 'Failed to export stage',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsExporting(false);
    }
  };

  const downloadExport = async (
    stageId: number,
    stageName: string,
    packageId?: number
  ) => {
    const data = await exportStage(stageId, packageId);
    if (!data) return;

    const filename = `stage-${stageName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Stage Exported',
      description: `Downloaded ${filename}`,
    });
  };

  const validateImportData = (data: any): data is StageExportData => {
    if (!data || typeof data !== 'object') return false;
    if (data.version !== '1.0') return false;
    if (!data.stage || typeof data.stage.title !== 'string') return false;
    if (!Array.isArray(data.team_tasks)) return false;
    if (!Array.isArray(data.client_tasks)) return false;
    if (!Array.isArray(data.emails)) return false;
    if (!Array.isArray(data.documents)) return false;
    return true;
  };

  const importStage = async (
    data: StageExportData,
    targetPackageId?: number
  ): Promise<ImportResult> => {
    setIsImporting(true);

    try {
      // Validate data
      if (!validateImportData(data)) {
        throw new Error('Invalid stage export file format');
      }

      // Check for name collision and generate unique name
      const { data: existingStages } = await supabase
        .from('documents_stages')
        .select('title')
        .ilike('title', `${data.stage.title}%`);

      let newTitle = data.stage.title;
      if (existingStages?.some(s => s.title === newTitle)) {
        newTitle = `${data.stage.title} (Imported)`;
        // Check again and add timestamp if still collision
        if (existingStages?.some(s => s.title === newTitle)) {
          newTitle = `${data.stage.title} (Imported ${Date.now()})`;
        }
      }

      // Generate unique stage_key
      const baseKey = newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const newStageKey = `${baseKey}-${Date.now()}`;

      // Create new stage (always non-certified for safety)
      const { data: newStage, error: createError } = await supabase
        .from('documents_stages')
        .insert({
          title: newTitle,
          short_name: data.stage.short_name,
          description: data.stage.description,
          stage_type: data.stage.stage_type || 'other',
          video_url: data.stage.video_url,
          ai_hint: data.stage.ai_hint,
          is_reusable: data.stage.is_reusable ?? true,
          dashboard_visible: data.stage.dashboard_visible ?? true,
          is_certified: false, // Always false for imports
          certified_notes: null,
          is_archived: false,
          stage_key: newStageKey,
        })
        .select()
        .single();

      if (createError || !newStage) {
        throw new Error('Failed to create stage');
      }

      const counts = {
        team_tasks: 0,
        client_tasks: 0,
        emails: 0,
        documents: 0,
      };

      // Only import content if a target package is specified
      if (targetPackageId && data.team_tasks.length > 0) {
        const { error } = await supabase.from('package_staff_tasks').insert(
          data.team_tasks.map(t => ({
            package_id: targetPackageId,
            stage_id: newStage.id,
            name: t.name,
            description: t.description,
            owner_role: t.owner_role || 'Admin',
            estimated_hours: t.estimated_hours,
            is_mandatory: t.is_mandatory ?? true,
            order_number: t.order_number,
          }))
        );
        if (!error) counts.team_tasks = data.team_tasks.length;
      }

      if (targetPackageId && data.client_tasks.length > 0) {
        const { error } = await supabase.from('package_client_tasks').insert(
          data.client_tasks.map(t => ({
            package_id: targetPackageId,
            stage_id: newStage.id,
            name: t.name,
            description: t.description,
            instructions: t.instructions,
            due_date_offset: t.due_date_offset,
            order_number: t.order_number,
          }))
        );
        if (!error) counts.client_tasks = data.client_tasks.length;
      }

      if (targetPackageId && data.emails.length > 0) {
        const { error } = await (supabase.from('package_stage_emails' as any).insert(
          data.emails.map(e => ({
            package_id: targetPackageId,
            stage_id: newStage.id,
            email_template_id: e.email_template_id,
            trigger_type: e.trigger_type,
            recipient_type: e.recipient_type,
            sort_order: e.sort_order,
            is_active: e.is_active ?? true,
          }))
        ) as any);
        if (!error) counts.emails = data.emails.length;
      }

      if (targetPackageId && data.documents.length > 0) {
        const { error } = await (supabase.from('package_stage_documents' as any).insert(
          data.documents.map(d => ({
            package_id: targetPackageId,
            stage_id: newStage.id,
            document_id: d.document_id,
            visibility: d.visibility,
            delivery_type: d.delivery_type,
            sort_order: d.sort_order,
          }))
        ) as any);
        if (!error) counts.documents = data.documents.length;
      }

      // Log import
      await supabase.from('audit_events').insert({
        entity: 'stage',
        entity_id: newStage.id.toString(),
        action: 'stage.imported',
        details: {
          original_title: data.stage.title,
          imported_title: newTitle,
          source_package_context: data.package_context,
          target_package_id: targetPackageId || null,
          task_count: counts.team_tasks + counts.client_tasks,
          email_count: counts.emails,
          document_count: counts.documents,
        },
      });

      return {
        success: true,
        newStageId: newStage.id,
        counts,
      };
    } catch (error: any) {
      console.error('Import failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to import stage',
      };
    } finally {
      setIsImporting(false);
    }
  };

  return {
    exportStage,
    downloadExport,
    importStage,
    validateImportData,
    isExporting,
    isImporting,
  };
}
