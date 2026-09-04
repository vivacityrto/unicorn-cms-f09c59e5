import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { TablesInsert } from '@/integrations/supabase/types';

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
        .from('stages')
        .select('*')
        .eq('id', sourceStageId)
        .single();

      if (stageError || !sourceStage) {
        throw new Error('Source stage not found');
      }

      // 2. Generate new stage_key
      const baseName = sourceStage.name.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-');
      const newStageKey = `${baseName}-copy-${Date.now()}`;

      // 3. Create new stage (without certification)
      // Handle version_label - append " (copy)" if original has one
      const newVersionLabel = sourceStage.version_label
        ? `${sourceStage.version_label} (copy)`
        : null;

      // KNOWN BUG (pre-existing, found while removing `any` here, not fixed - see
      // execution-efficiency-log.md): stages.id has no default/sequence at the DB
      // level (confirmed via information_schema - column_default is null, not-null
      // constrained), so every insert into `stages` requires an explicit id. This
      // insert has always failed with a NOT NULL violation - "Duplicate Stage" has
      // never actually created a copy. Fixing it needs a schema decision (add a
      // sequence/default to stages.id, which is a migration requiring its own audit
      // entry) that's out of scope for a type-only batch - left functionally
      // unchanged, typed honestly via an explicit cast rather than `any`.
      const { data: newStage, error: createError } = await supabase
        .from('stages')
        .insert({
          name: `${sourceStage.name} (Copy)`,
          shortname: sourceStage.shortname,
          description: sourceStage.description,
          videourl: sourceStage.videourl,
          stage_type: sourceStage.stage_type,
          stage_key: newStageKey,
          ai_hint: sourceStage.ai_hint,
          is_reusable: sourceStage.is_reusable,
          dashboard_visible: sourceStage.dashboard_visible,
          is_certified: false,
          certified_notes: null,
          is_archived: false,
          version_label: newVersionLabel,
        } as unknown as TablesInsert<'stages'>)
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
              const newStaffTasks = staffTasks.map((t) => ({
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
              const newClientTasks = clientTasks.map((t) => ({
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
            const { data: emails } = await supabase
              .from('package_stage_emails')
              .select('*')
              .eq('package_id', sourcePackageId)
              .eq('stage_id', sourceStageId);

            if (emails?.length) {
              const newEmails = emails.map((e) => ({
                package_id: targetPkgId,
                stage_id: newStage.id,
                email_template_id: e.email_template_id,
                trigger_type: e.trigger_type,
                recipient_type: e.recipient_type,
                sort_order: e.sort_order,
                is_active: e.is_active,
              }));
              await supabase.from('package_stage_emails').insert(newEmails);
            }

            // Copy stage documents
            const { data: docs } = await supabase
              .from('package_stage_documents')
              .select('*')
              .eq('package_id', sourcePackageId)
              .eq('stage_id', sourceStageId);

            if (docs?.length) {
              const newDocs = docs.map((d) => ({
                package_id: targetPkgId,
                stage_id: newStage.id,
                document_id: d.document_id,
                visibility: d.visibility,
                delivery_type: d.delivery_type,
                sort_order: d.sort_order,
              }));
              await supabase.from('package_stage_documents').insert(newDocs);
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
    } catch (error) {
      console.error('Stage duplication failed:', error);
      toast({
        title: 'Duplication Failed',
        description: error instanceof Error ? error.message : 'Failed to duplicate phase',
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
