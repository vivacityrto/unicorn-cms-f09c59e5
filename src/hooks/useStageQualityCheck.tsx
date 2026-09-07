import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  evaluateStageQualityChecks,
  appendCertifiedIntegrityCheck,
  summarizeStageQuality,
  type StageQualitySnapshot,
} from './stageQualityEvaluator';

export type { QualityStatus, QualityCheck, StageQualityResult } from './stageQualityEvaluator';
import type { StageQualityResult } from './stageQualityEvaluator';

interface UseStageQualityCheckOptions {
  stageId: number | null;
  packageId?: number | null;
  enabled?: boolean;
}

async function fetchStageQualitySnapshot(
  stageId: number,
  packageId?: number | null,
): Promise<{ snapshot: StageQualitySnapshot; isCertified: boolean } | null> {
  const { data: stageRaw, error: stageError } = await supabase
    .from('stages')
    .select('id, name, stage_type, is_certified, is_archived, certified_notes')
    .eq('id', stageId)
    .single();
  const stage = stageRaw ? { ...stageRaw, title: stageRaw.name } : null;

  if (stageError || !stage) {
    throw new Error('Stage not found');
  }

  const stageType = stage.stage_type || 'other';

  // B) Team task checks - use base table for templates, package table for package context
  let teamTaskCount = 0;
  if (packageId) {
    const { count } = await supabase
      .from('package_staff_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('stage_id', stageId)
      .eq('package_id', packageId);
    teamTaskCount = count || 0;
  } else {
    const { count } = await supabase
      .from('staff_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('stage_id', stageId);
    teamTaskCount = count || 0;
  }

  // C) Client task checks
  let clientTaskCount = 0;
  if (packageId) {
    const { count } = await supabase
      .from('package_client_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('stage_id', stageId)
      .eq('package_id', packageId);
    clientTaskCount = count || 0;
  } else {
    const { count } = await supabase
      .from('client_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('stage_id', stageId);
    clientTaskCount = count || 0;
  }

  // D) Email checks
  let emailCount = 0;
  let tenantEmailCount = 0;
  let draftEmailCount = 0;

  if (packageId) {
    const { data: emails } = await supabase
      .from('package_stage_emails')
      .select(`id, recipient_type, email_templates!inner (status)`)
      .eq('stage_id', stageId)
      .eq('package_id', packageId);

    emailCount = emails?.length || 0;
    tenantEmailCount = emails?.filter((e) => e.recipient_type === 'tenant').length || 0;
    draftEmailCount = emails?.filter((e) => e.email_templates?.status === 'draft').length || 0;
  } else {
    // Template context: count from base emails table
    const { count } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true })
      .eq('stage_id', stageId);

    emailCount = count || 0;
    // Base emails table doesn't have recipient_type/template status, so treat all as tenant-facing
    tenantEmailCount = emailCount;
    draftEmailCount = 0;
  }

  // E) Document checks
  let documentCount = 0;
  let tenantVisibleDocs = 0;
  let teamOnlyDocs = 0;

  if (packageId) {
    const { data: docs } = await supabase
      .from('package_stage_documents')
      .select('id, visibility')
      .eq('stage_id', stageId)
      .eq('package_id', packageId);

    documentCount = docs?.length || 0;
    tenantVisibleDocs = docs?.filter((d) => d.visibility !== 'team_only').length || 0;
    teamOnlyDocs = docs?.filter((d) => d.visibility === 'team_only').length || 0;
  } else {
    // Template context: count from base documents table (stage column)
    // union-aware with document_stage_links.
    const { data: linkRows } = await supabase
      .from('document_stage_links')
      .select('document_id')
      .eq('stage_id', stageId);
    const additionalIds = Array.from(
      new Set(((linkRows ?? []) as { document_id: number }[]).map((r) => r.document_id)),
    );
    let countQuery = supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });
    if (additionalIds.length > 0) {
      countQuery = countQuery.or(
        `stage.eq.${stageId},id.in.(${additionalIds.join(',')})`,
      );
    } else {
      countQuery = countQuery.eq('stage', stageId);
    }
    const { count } = await countQuery;

    documentCount = count || 0;
    tenantVisibleDocs = documentCount; // Base docs don't have visibility, assume tenant-visible
    teamOnlyDocs = 0;
  }

  return {
    snapshot: {
      title: stage.title,
      stageType,
      isArchived: !!stage.is_archived,
      teamTaskCount,
      clientTaskCount,
      emailCount,
      tenantEmailCount,
      draftEmailCount,
      documentCount,
      tenantVisibleDocs,
      teamOnlyDocs,
    },
    isCertified: !!stage.is_certified,
  };
}

/**
 * Computes stage quality checks based on structure, content, and type requirements.
 * Returns pass/warn/fail status with detailed check results.
 */
export function useStageQualityCheck({
  stageId,
  packageId,
  enabled = true
}: UseStageQualityCheckOptions) {
  const [result, setResult] = useState<StageQualityResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const computeQuality = useCallback(async () => {
    if (!stageId || !enabled) {
      setResult(null);
      return null;
    }

    setIsLoading(true);

    try {
      const fetched = await fetchStageQualitySnapshot(stageId, packageId);
      if (!fetched) {
        setResult(null);
        return null;
      }

      const checks = evaluateStageQualityChecks(fetched.snapshot, {
        includeGenericEmailPass: true,
        includeGenericDocumentPass: true,
      });
      appendCertifiedIntegrityCheck(checks, fetched.isCertified);

      const qualityResult = summarizeStageQuality(checks);
      setResult(qualityResult);
      return qualityResult;
    } catch (error) {
      console.error('Quality check error:', error);
      setResult(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [stageId, packageId, enabled]);

  useEffect(() => {
    computeQuality();
  }, [computeQuality]);

  return {
    result,
    isLoading,
    refetch: computeQuality
  };
}

/**
 * Standalone function to compute quality without hook (for certification guardrail)
 */
export async function computeStageQuality(
  stageId: number,
  packageId?: number
): Promise<StageQualityResult | null> {
  try {
    const fetched = await fetchStageQualitySnapshot(stageId, packageId);
    if (!fetched) return null;

    const checks = evaluateStageQualityChecks(fetched.snapshot, {
      includeGenericEmailPass: false,
      includeGenericDocumentPass: false,
    });

    return summarizeStageQuality(checks);
  } catch (error) {
    console.error('Quality check error:', error);
    return null;
  }
}
