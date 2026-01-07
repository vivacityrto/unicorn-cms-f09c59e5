import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DuplicateOptions {
  sourceStageId: number;
  sourcePackageId?: number; // If content is package-contextual, copy from this package
  targetPackageIds?: number[]; // Copy content to these packages (optional)
}

interface DuplicateResult {
  newStageId: number;
  newStageKey: string;
  contentCopied: boolean;
  packagesUpdated: number;
}

export function useStageDuplication() {
  const [isDuplicating, setIsDuplicating] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const duplicateStage = async (options: DuplicateOptions): Promise<DuplicateResult | null> => {
    const { sourceStageId, sourcePackageId, targetPackageIds } = options;
    setIsDuplicating(true);

    try {
      // 1. Fetch source stage
      const { data: sourceStage, error: stageError } = await supabase
        .from('documents_stages')
        .select('*')
        .eq('id', sourceStageId)
        .single();

      if (stageError || !sourceStage) {
        throw new Error('Source stage not found');
      }

      // 2. Generate new stage_key
      const baseName = sourceStage.title.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-');
      const newStageKey = `${baseName}-copy-${Date.now()}`;

      // 3. Create new stage (without certification)
      // Handle version_label - append " (copy)" if original has one
      const newVersionLabel = sourceStage.version_label 
        ? `${sourceStage.version_label} (copy)` 
        : null;

      const { data: newStage, error: createError } = await supabase
        .from('documents_stages')
        .insert({
          title: `${sourceStage.title} (Copy)`,
          short_name: sourceStage.short_name,
          description: sourceStage.description,
          video_url: sourceStage.video_url,
          stage_type: sourceStage.stage_type,
          stage_key: newStageKey,
          ai_hint: sourceStage.ai_hint,
          is_reusable: sourceStage.is_reusable,
          dashboard_visible: sourceStage.dashboard_visible,
          is_certified: false, // Always false for copies
          certified_notes: null,
          is_archived: false,
          version_label: newVersionLabel,
        })
        .select()
        .single();

      if (createError || !newStage) {
        throw new Error('Failed to create stage copy');
      }

      let contentCopied = false;
      let packagesUpdated = 0;

      // 4. Copy content if source package context is provided
      if (sourcePackageId) {
        const targetPkgs = targetPackageIds?.length ? targetPackageIds : [sourcePackageId];

        for (const targetPkgId of targetPkgs) {
          try {
            // Copy staff tasks
            const { data: staffTasks } = await supabase
              .from('package_staff_tasks')
              .select('*')
              .eq('package_id', sourcePackageId)
              .eq('stage_id', sourceStageId);

            if (staffTasks?.length) {
              const newStaffTasks = staffTasks.map((t: any) => ({
                package_id: targetPkgId,
                stage_id: newStage.id,
                name: t.name,
                description: t.description,
                order_number: t.order_number,
                owner_role: t.owner_role,
                estimated_hours: t.estimated_hours,
                is_mandatory: t.is_mandatory,
              }));
              await supabase.from('package_staff_tasks').insert(newStaffTasks);
            }

            // Copy client tasks
            const { data: clientTasks } = await supabase
              .from('package_client_tasks')
              .select('*')
              .eq('package_id', sourcePackageId)
              .eq('stage_id', sourceStageId);

            if (clientTasks?.length) {
              const newClientTasks = clientTasks.map((t: any) => ({
                package_id: targetPkgId,
                stage_id: newStage.id,
                name: t.name,
                description: t.description,
                order_number: t.order_number,
                instructions: t.instructions,
                due_date_offset: t.due_date_offset,
              }));
              await supabase.from('package_client_tasks').insert(newClientTasks);
            }

            // Copy stage emails
            const { data: emails } = await (supabase
              .from('package_stage_emails' as any)
              .select('*')
              .eq('package_id', sourcePackageId)
              .eq('stage_id', sourceStageId) as any);

            if (emails?.length) {
              const newEmails = emails.map((e: any) => ({
                package_id: targetPkgId,
                stage_id: newStage.id,
                email_template_id: e.email_template_id,
                trigger_type: e.trigger_type,
                recipient_type: e.recipient_type,
                sort_order: e.sort_order,
                is_active: e.is_active,
              }));
              await (supabase.from('package_stage_emails' as any).insert(newEmails) as any);
            }

            // Copy stage documents
            const { data: docs } = await (supabase
              .from('package_stage_documents' as any)
              .select('*')
              .eq('package_id', sourcePackageId)
              .eq('stage_id', sourceStageId) as any);

            if (docs?.length) {
              const newDocs = docs.map((d: any) => ({
                package_id: targetPkgId,
                stage_id: newStage.id,
                document_id: d.document_id,
                visibility: d.visibility,
                delivery_type: d.delivery_type,
                sort_order: d.sort_order,
              }));
              await (supabase.from('package_stage_documents' as any).insert(newDocs) as any);
            }

            contentCopied = true;
            packagesUpdated++;
          } catch (err) {
            console.error(`Failed to copy content for package ${targetPkgId}:`, err);
          }
        }
      }

      // 5. Log audit event
      await supabase.from('audit_events').insert({
        entity: 'stage',
        entity_id: newStage.id.toString(),
        action: 'stage.duplicated',
        details: {
          source_stage_id: sourceStageId,
          new_stage_id: newStage.id,
          source_package_id: sourcePackageId || null,
          content_copied: contentCopied,
          packages_updated: packagesUpdated,
        },
      });

      return {
        newStageId: newStage.id,
        newStageKey: newStageKey,
        contentCopied,
        packagesUpdated,
      };
    } catch (error: any) {
      console.error('Stage duplication failed:', error);
      toast({
        title: 'Duplication Failed',
        description: error.message || 'Failed to duplicate stage',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsDuplicating(false);
    }
  };

  const duplicateAndNavigate = async (options: DuplicateOptions) => {
    const result = await duplicateStage(options);
    if (result) {
      toast({
        title: 'Stage Duplicated',
        description: `Created copy. This copy is not certified.`,
      });
      navigate(`/admin/stages/${result.newStageId}`);
    }
    return result;
  };

  return {
    duplicateStage,
    duplicateAndNavigate,
    isDuplicating,
  };
}
