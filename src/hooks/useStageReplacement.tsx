import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ReplaceOptions {
  oldStageId: number;
  newStageId: number;
  packageIds: number[];
  copyContent: boolean;
}

interface ReplaceResult {
  updated: number;
  skipped: number;
  errors: { packageId: number; reason: string }[];
}

export function useStageReplacement() {
  const [isReplacing, setIsReplacing] = useState(false);
  const { toast } = useToast();

  const replaceStageInPackages = async (options: ReplaceOptions): Promise<ReplaceResult | null> => {
    const { oldStageId, newStageId, packageIds, copyContent } = options;
    
    if (oldStageId === newStageId) {
      toast({
        title: 'Invalid Selection',
        description: 'Cannot replace a stage with itself',
        variant: 'destructive',
      });
      return null;
    }

    setIsReplacing(true);
    const result: ReplaceResult = { updated: 0, skipped: 0, errors: [] };

    try {
      // Check if target stage is archived
      const { data: targetStage } = await supabase
        .from('stages')
        .select('is_archived, name')
        .eq('id', newStageId)
        .single();

      if (targetStage?.is_archived) {
        toast({
          title: 'Invalid Target',
          description: 'Cannot replace with an archived stage',
          variant: 'destructive',
        });
        return null;
      }

      for (const packageId of packageIds) {
        try {
          // Check if package already has the new stage (would create duplicate)
          const { data: existing } = await supabase
            .from('package_stages')
            .select('id')
            .eq('package_id', packageId)
            .eq('stage_id', newStageId)
            .maybeSingle();

          if (existing) {
            result.skipped++;
            result.errors.push({ 
              packageId, 
              reason: 'Package already has the target stage' 
            });
            continue;
          }

          // Get old package_stage entry
          const { data: oldEntry } = await supabase
            .from('package_stages')
            .select('*')
            .eq('package_id', packageId)
            .eq('stage_id', oldStageId)
            .single();

          if (!oldEntry) {
            result.skipped++;
            result.errors.push({ packageId, reason: 'Stage not found in package' });
            continue;
          }

          // Copy content if requested
          if (copyContent) {
            // Check if new stage already has content for this package
            const { data: existingContent } = await supabase
              .from('package_staff_tasks')
              .select('id')
              .eq('package_id', packageId)
              .eq('stage_id', newStageId)
              .limit(1);

            if (!existingContent?.length) {
              // Copy staff tasks
              const { data: staffTasks } = await supabase
                .from('package_staff_tasks')
                .select('*')
                .eq('package_id', packageId)
                .eq('stage_id', oldStageId);

              if (staffTasks?.length) {
                await supabase.from('package_staff_tasks').insert(
                  staffTasks.map((t) => ({
                    package_id: packageId,
                    stage_id: newStageId,
                    name: t.name,
                    description: t.description,
                    order_number: t.order_number,
                    owner_role: t.owner_role,
                    estimated_hours: t.estimated_hours,
                    is_mandatory: t.is_mandatory,
                  }))
                );
              }

              // Copy client tasks
              const { data: clientTasks } = await supabase
                .from('package_client_tasks')
                .select('*')
                .eq('package_id', packageId)
                .eq('stage_id', oldStageId);

              if (clientTasks?.length) {
                await supabase.from('package_client_tasks').insert(
                  clientTasks.map((t) => ({
                    package_id: packageId,
                    stage_id: newStageId,
                    name: t.name,
                    description: t.description,
                    order_number: t.order_number,
                    instructions: t.instructions,
                    due_date_offset: t.due_date_offset,
                  }))
                );
              }

              // Copy stage emails
              const { data: emails } = await supabase
                .from('package_stage_emails')
                .select('*')
                .eq('package_id', packageId)
                .eq('stage_id', oldStageId);

              if (emails?.length) {
                await supabase.from('package_stage_emails').insert(
                  emails.map((e) => ({
                    package_id: packageId,
                    stage_id: newStageId,
                    email_template_id: e.email_template_id,
                    trigger_type: e.trigger_type,
                    recipient_type: e.recipient_type,
                    sort_order: e.sort_order,
                    is_active: e.is_active,
                  }))
                );
              }

              // Copy stage documents
              const { data: docs } = await supabase
                .from('package_stage_documents')
                .select('*')
                .eq('package_id', packageId)
                .eq('stage_id', oldStageId);

              if (docs?.length) {
                await supabase.from('package_stage_documents').insert(
                  docs.map((d) => ({
                    package_id: packageId,
                    stage_id: newStageId,
                    document_id: d.document_id,
                    visibility: d.visibility,
                    delivery_type: d.delivery_type,
                    sort_order: d.sort_order,
                  }))
                );
              }
            }
          }

          // Update package_stages: change stage_id from old to new
          const { error: updateError } = await supabase
            .from('package_stages')
            .update({ stage_id: newStageId })
            .eq('package_id', packageId)
            .eq('stage_id', oldStageId);

          if (updateError) {
            if (updateError.code === '23505') {
              // Unique constraint violation
              result.skipped++;
              result.errors.push({ 
                packageId, 
                reason: 'Would create duplicate stage entry' 
              });
            } else {
              throw updateError;
            }
          } else {
            result.updated++;
          }
        } catch (err) {
          result.skipped++;
          result.errors.push({ packageId, reason: err instanceof Error ? err.message : 'Unknown error' });
        }
      }

      // Log audit event
      await supabase.from('audit_events').insert({
        entity: 'stage',
        entity_id: oldStageId.toString(),
        action: 'stage.replaced_in_packages',
        details: {
          old_stage_id: oldStageId,
          new_stage_id: newStageId,
          package_ids: packageIds,
          updated: result.updated,
          skipped: result.skipped,
          copy_content: copyContent,
          errors: result.errors,
        },
      });

      return result;
    } catch (error) {
      console.error('Stage replacement failed:', error);
      toast({
        title: 'Replacement Failed',
        description: error instanceof Error ? error.message : 'Failed to replace stage in packages',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsReplacing(false);
    }
  };

  return {
    replaceStageInPackages,
    isReplacing,
  };
}
