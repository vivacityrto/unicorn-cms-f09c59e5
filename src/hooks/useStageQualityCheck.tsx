import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type QualityStatus = 'pass' | 'warn' | 'fail';

export interface QualityCheck {
  check_key: string;
  label: string;
  status: QualityStatus;
  message: string;
  category: 'structure' | 'team_tasks' | 'client_tasks' | 'emails' | 'documents' | 'certified';
}

export interface StageQualityResult {
  status: QualityStatus;
  checks: QualityCheck[];
  passCount: number;
  warnCount: number;
  failCount: number;
}

interface UseStageQualityCheckOptions {
  stageId: number | null;
  packageId?: number | null;
  enabled?: boolean;
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
    const checks: QualityCheck[] = [];

    try {
      // Fetch stage data
      const { data: stage, error: stageError } = await supabase
        .from('documents_stages')
        .select('id, title, stage_type, is_certified, is_archived, certified_notes')
        .eq('id', stageId)
        .single();

      if (stageError || !stage) {
        throw new Error('Stage not found');
      }

      const stageType = stage.stage_type || 'other';

      // A) Core structure checks
      if (!stage.title || stage.title.trim() === '') {
        checks.push({
          check_key: 'stage_name',
          label: 'Stage Name',
          status: 'fail',
          message: 'Stage must have a name.',
          category: 'structure'
        });
      } else {
        checks.push({
          check_key: 'stage_name',
          label: 'Stage Name',
          status: 'pass',
          message: 'Stage has a name.',
          category: 'structure'
        });
      }

      if (!stageType || stageType === '') {
        checks.push({
          check_key: 'stage_type',
          label: 'Stage Type',
          status: 'fail',
          message: 'Stage must have a type defined.',
          category: 'structure'
        });
      } else {
        checks.push({
          check_key: 'stage_type',
          label: 'Stage Type',
          status: 'pass',
          message: `Stage type is "${stageType}".`,
          category: 'structure'
        });
      }

      if (stage.is_archived) {
        checks.push({
          check_key: 'stage_archived',
          label: 'Stage Status',
          status: 'fail',
          message: 'Stage is archived and cannot be certified.',
          category: 'structure'
        });
      } else {
        checks.push({
          check_key: 'stage_archived',
          label: 'Stage Status',
          status: 'pass',
          message: 'Stage is active.',
          category: 'structure'
        });
      }

      // B) Team task checks - count from package_staff_tasks if packageId provided
      let teamTaskCount = 0;
      if (packageId) {
        const { count } = await supabase
          .from('package_staff_tasks')
          .select('*', { count: 'exact', head: true })
          .eq('stage_id', stageId)
          .eq('package_id', packageId);
        teamTaskCount = count || 0;
      } else {
        // Check across all packages if no specific package
        const { count } = await supabase
          .from('package_staff_tasks')
          .select('*', { count: 'exact', head: true })
          .eq('stage_id', stageId);
        teamTaskCount = count || 0;
      }

      if (teamTaskCount === 0) {
        checks.push({
          check_key: 'team_tasks_exist',
          label: 'Team Tasks',
          status: 'fail',
          message: 'At least one team task is required.',
          category: 'team_tasks'
        });
      } else {
        checks.push({
          check_key: 'team_tasks_exist',
          label: 'Team Tasks',
          status: 'pass',
          message: `${teamTaskCount} team task${teamTaskCount !== 1 ? 's' : ''} defined.`,
          category: 'team_tasks'
        });
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
          .from('package_client_tasks')
          .select('*', { count: 'exact', head: true })
          .eq('stage_id', stageId);
        clientTaskCount = count || 0;
      }

      if (['onboarding', 'offboarding'].includes(stageType)) {
        if (clientTaskCount === 0) {
          checks.push({
            check_key: 'client_tasks_exist',
            label: 'Client Tasks',
            status: 'fail',
            message: `${stageType === 'onboarding' ? 'Onboarding' : 'Offboarding'} stages require at least one client task.`,
            category: 'client_tasks'
          });
        } else {
          checks.push({
            check_key: 'client_tasks_exist',
            label: 'Client Tasks',
            status: 'pass',
            message: `${clientTaskCount} client task${clientTaskCount !== 1 ? 's' : ''} defined.`,
            category: 'client_tasks'
          });
        }
      } else {
        if (clientTaskCount === 0) {
          checks.push({
            check_key: 'client_tasks_exist',
            label: 'Client Tasks',
            status: 'warn',
            message: 'No client tasks defined. Consider adding tasks for tenant visibility.',
            category: 'client_tasks'
          });
        } else {
          checks.push({
            check_key: 'client_tasks_exist',
            label: 'Client Tasks',
            status: 'pass',
            message: `${clientTaskCount} client task${clientTaskCount !== 1 ? 's' : ''} defined.`,
            category: 'client_tasks'
          });
        }
      }

      // D) Email checks
      let emailCount = 0;
      let tenantEmailCount = 0;
      let draftEmailCount = 0;

      if (packageId) {
        const { data: emails } = await supabase
          .from('package_stage_emails')
          .select(`
            id,
            recipient_type,
            email_templates!inner (status)
          `)
          .eq('stage_id', stageId)
          .eq('package_id', packageId);

        emailCount = emails?.length || 0;
        tenantEmailCount = emails?.filter((e: any) => e.recipient_type === 'tenant').length || 0;
        draftEmailCount = emails?.filter((e: any) => e.email_templates?.status === 'draft').length || 0;
      } else {
        const { data: emails } = await supabase
          .from('package_stage_emails')
          .select(`
            id,
            recipient_type,
            email_templates!inner (status)
          `)
          .eq('stage_id', stageId);

        emailCount = emails?.length || 0;
        tenantEmailCount = emails?.filter((e: any) => e.recipient_type === 'tenant').length || 0;
        draftEmailCount = emails?.filter((e: any) => e.email_templates?.status === 'draft').length || 0;
      }

      if (['delivery', 'documentation', 'onboarding'].includes(stageType)) {
        if (tenantEmailCount === 0) {
          checks.push({
            check_key: 'tenant_emails_exist',
            label: 'Tenant Emails',
            status: 'warn',
            message: `${stageType.charAt(0).toUpperCase() + stageType.slice(1)} stages should have at least one tenant-facing email.`,
            category: 'emails'
          });
        } else {
          checks.push({
            check_key: 'tenant_emails_exist',
            label: 'Tenant Emails',
            status: 'pass',
            message: `${tenantEmailCount} tenant email${tenantEmailCount !== 1 ? 's' : ''} linked.`,
            category: 'emails'
          });
        }
      } else if (emailCount > 0) {
        checks.push({
          check_key: 'tenant_emails_exist',
          label: 'Emails',
          status: 'pass',
          message: `${emailCount} email${emailCount !== 1 ? 's' : ''} linked.`,
          category: 'emails'
        });
      }

      if (draftEmailCount > 0) {
        checks.push({
          check_key: 'draft_emails',
          label: 'Email Status',
          status: 'warn',
          message: `${draftEmailCount} linked email${draftEmailCount !== 1 ? 's are' : ' is'} still in draft status.`,
          category: 'emails'
        });
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
        tenantVisibleDocs = docs?.filter((d: any) => d.visibility !== 'team_only').length || 0;
        teamOnlyDocs = docs?.filter((d: any) => d.visibility === 'team_only').length || 0;
      } else {
        const { data: docs } = await supabase
          .from('package_stage_documents')
          .select('id, visibility')
          .eq('stage_id', stageId);

        documentCount = docs?.length || 0;
        tenantVisibleDocs = docs?.filter((d: any) => d.visibility !== 'team_only').length || 0;
        teamOnlyDocs = docs?.filter((d: any) => d.visibility === 'team_only').length || 0;
      }

      if (['delivery', 'documentation'].includes(stageType)) {
        if (tenantVisibleDocs === 0) {
          checks.push({
            check_key: 'tenant_docs_exist',
            label: 'Tenant Documents',
            status: 'fail',
            message: `${stageType.charAt(0).toUpperCase() + stageType.slice(1)} stages require at least one tenant-visible document.`,
            category: 'documents'
          });
        } else {
          checks.push({
            check_key: 'tenant_docs_exist',
            label: 'Tenant Documents',
            status: 'pass',
            message: `${tenantVisibleDocs} tenant-visible document${tenantVisibleDocs !== 1 ? 's' : ''} linked.`,
            category: 'documents'
          });
        }
      } else if (documentCount > 0) {
        checks.push({
          check_key: 'tenant_docs_exist',
          label: 'Documents',
          status: 'pass',
          message: `${documentCount} document${documentCount !== 1 ? 's' : ''} linked.`,
          category: 'documents'
        });
      }

      if (documentCount > 0 && tenantVisibleDocs === 0 && teamOnlyDocs === documentCount) {
        checks.push({
          check_key: 'all_docs_team_only',
          label: 'Document Visibility',
          status: 'warn',
          message: 'All linked documents are team-only. Tenants will not see any documents.',
          category: 'documents'
        });
      }

      // F) Certified integrity checks
      if (stage.is_certified) {
        const failedChecks = checks.filter(c => c.status === 'fail');
        const warnChecks = checks.filter(c => c.status === 'warn');
        
        if (failedChecks.length > 0) {
          checks.push({
            check_key: 'certified_integrity',
            label: 'Certified Integrity',
            status: 'fail',
            message: `Certified stage has ${failedChecks.length} failing check${failedChecks.length !== 1 ? 's' : ''} that must be resolved.`,
            category: 'certified'
          });
        } else if (warnChecks.length > 0) {
          checks.push({
            check_key: 'certified_integrity',
            label: 'Certified Integrity',
            status: 'warn',
            message: `Certified stage has ${warnChecks.length} warning${warnChecks.length !== 1 ? 's' : ''} that should be reviewed.`,
            category: 'certified'
          });
        } else {
          checks.push({
            check_key: 'certified_integrity',
            label: 'Certified Integrity',
            status: 'pass',
            message: 'Certified stage passes all quality checks.',
            category: 'certified'
          });
        }
      }

      // Calculate overall status
      const failCount = checks.filter(c => c.status === 'fail').length;
      const warnCount = checks.filter(c => c.status === 'warn').length;
      const passCount = checks.filter(c => c.status === 'pass').length;

      let overallStatus: QualityStatus = 'pass';
      if (failCount > 0) {
        overallStatus = 'fail';
      } else if (warnCount > 0) {
        overallStatus = 'warn';
      }

      const qualityResult: StageQualityResult = {
        status: overallStatus,
        checks,
        passCount,
        warnCount,
        failCount
      };

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
  const checks: QualityCheck[] = [];

  try {
    // Fetch stage data
    const { data: stage, error: stageError } = await supabase
      .from('documents_stages')
      .select('id, title, stage_type, is_certified, is_archived, certified_notes')
      .eq('id', stageId)
      .single();

    if (stageError || !stage) {
      return null;
    }

    const stageType = stage.stage_type || 'other';

    // A) Core structure checks
    if (!stage.title || stage.title.trim() === '') {
      checks.push({
        check_key: 'stage_name',
        label: 'Stage Name',
        status: 'fail',
        message: 'Stage must have a name.',
        category: 'structure'
      });
    } else {
      checks.push({
        check_key: 'stage_name',
        label: 'Stage Name',
        status: 'pass',
        message: 'Stage has a name.',
        category: 'structure'
      });
    }

    if (!stageType || stageType === '') {
      checks.push({
        check_key: 'stage_type',
        label: 'Stage Type',
        status: 'fail',
        message: 'Stage must have a type defined.',
        category: 'structure'
      });
    } else {
      checks.push({
        check_key: 'stage_type',
        label: 'Stage Type',
        status: 'pass',
        message: `Stage type is "${stageType}".`,
        category: 'structure'
      });
    }

    if (stage.is_archived) {
      checks.push({
        check_key: 'stage_archived',
        label: 'Stage Status',
        status: 'fail',
        message: 'Stage is archived and cannot be certified.',
        category: 'structure'
      });
    } else {
      checks.push({
        check_key: 'stage_archived',
        label: 'Stage Status',
        status: 'pass',
        message: 'Stage is active.',
        category: 'structure'
      });
    }

    // B) Team task checks
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
        .from('package_staff_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('stage_id', stageId);
      teamTaskCount = count || 0;
    }

    if (teamTaskCount === 0) {
      checks.push({
        check_key: 'team_tasks_exist',
        label: 'Team Tasks',
        status: 'fail',
        message: 'At least one team task is required.',
        category: 'team_tasks'
      });
    } else {
      checks.push({
        check_key: 'team_tasks_exist',
        label: 'Team Tasks',
        status: 'pass',
        message: `${teamTaskCount} team task${teamTaskCount !== 1 ? 's' : ''} defined.`,
        category: 'team_tasks'
      });
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
        .from('package_client_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('stage_id', stageId);
      clientTaskCount = count || 0;
    }

    if (['onboarding', 'offboarding'].includes(stageType)) {
      if (clientTaskCount === 0) {
        checks.push({
          check_key: 'client_tasks_exist',
          label: 'Client Tasks',
          status: 'fail',
          message: `${stageType === 'onboarding' ? 'Onboarding' : 'Offboarding'} stages require at least one client task.`,
          category: 'client_tasks'
        });
      } else {
        checks.push({
          check_key: 'client_tasks_exist',
          label: 'Client Tasks',
          status: 'pass',
          message: `${clientTaskCount} client task${clientTaskCount !== 1 ? 's' : ''} defined.`,
          category: 'client_tasks'
        });
      }
    } else {
      if (clientTaskCount === 0) {
        checks.push({
          check_key: 'client_tasks_exist',
          label: 'Client Tasks',
          status: 'warn',
          message: 'No client tasks defined. Consider adding tasks for tenant visibility.',
          category: 'client_tasks'
        });
      } else {
        checks.push({
          check_key: 'client_tasks_exist',
          label: 'Client Tasks',
          status: 'pass',
          message: `${clientTaskCount} client task${clientTaskCount !== 1 ? 's' : ''} defined.`,
          category: 'client_tasks'
        });
      }
    }

    // D) Email checks
    let tenantEmailCount = 0;
    let draftEmailCount = 0;

    if (packageId) {
      const { data: emails } = await supabase
        .from('package_stage_emails')
        .select(`id, recipient_type, email_templates!inner (status)`)
        .eq('stage_id', stageId)
        .eq('package_id', packageId);

      tenantEmailCount = emails?.filter((e: any) => e.recipient_type === 'tenant').length || 0;
      draftEmailCount = emails?.filter((e: any) => e.email_templates?.status === 'draft').length || 0;
    } else {
      const { data: emails } = await supabase
        .from('package_stage_emails')
        .select(`id, recipient_type, email_templates!inner (status)`)
        .eq('stage_id', stageId);

      tenantEmailCount = emails?.filter((e: any) => e.recipient_type === 'tenant').length || 0;
      draftEmailCount = emails?.filter((e: any) => e.email_templates?.status === 'draft').length || 0;
    }

    if (['delivery', 'documentation', 'onboarding'].includes(stageType)) {
      if (tenantEmailCount === 0) {
        checks.push({
          check_key: 'tenant_emails_exist',
          label: 'Tenant Emails',
          status: 'warn',
          message: `${stageType.charAt(0).toUpperCase() + stageType.slice(1)} stages should have at least one tenant-facing email.`,
          category: 'emails'
        });
      } else {
        checks.push({
          check_key: 'tenant_emails_exist',
          label: 'Tenant Emails',
          status: 'pass',
          message: `${tenantEmailCount} tenant email${tenantEmailCount !== 1 ? 's' : ''} linked.`,
          category: 'emails'
        });
      }
    }

    if (draftEmailCount > 0) {
      checks.push({
        check_key: 'draft_emails',
        label: 'Email Status',
        status: 'warn',
        message: `${draftEmailCount} linked email${draftEmailCount !== 1 ? 's are' : ' is'} still in draft status.`,
        category: 'emails'
      });
    }

    // E) Document checks
    let tenantVisibleDocs = 0;
    let documentCount = 0;
    let teamOnlyDocs = 0;

    if (packageId) {
      const { data: docs } = await supabase
        .from('package_stage_documents')
        .select('id, visibility')
        .eq('stage_id', stageId)
        .eq('package_id', packageId);

      documentCount = docs?.length || 0;
      tenantVisibleDocs = docs?.filter((d: any) => d.visibility !== 'team_only').length || 0;
      teamOnlyDocs = docs?.filter((d: any) => d.visibility === 'team_only').length || 0;
    } else {
      const { data: docs } = await supabase
        .from('package_stage_documents')
        .select('id, visibility')
        .eq('stage_id', stageId);

      documentCount = docs?.length || 0;
      tenantVisibleDocs = docs?.filter((d: any) => d.visibility !== 'team_only').length || 0;
      teamOnlyDocs = docs?.filter((d: any) => d.visibility === 'team_only').length || 0;
    }

    if (['delivery', 'documentation'].includes(stageType)) {
      if (tenantVisibleDocs === 0) {
        checks.push({
          check_key: 'tenant_docs_exist',
          label: 'Tenant Documents',
          status: 'fail',
          message: `${stageType.charAt(0).toUpperCase() + stageType.slice(1)} stages require at least one tenant-visible document.`,
          category: 'documents'
        });
      } else {
        checks.push({
          check_key: 'tenant_docs_exist',
          label: 'Tenant Documents',
          status: 'pass',
          message: `${tenantVisibleDocs} tenant-visible document${tenantVisibleDocs !== 1 ? 's' : ''} linked.`,
          category: 'documents'
        });
      }
    }

    if (documentCount > 0 && tenantVisibleDocs === 0 && teamOnlyDocs === documentCount) {
      checks.push({
        check_key: 'all_docs_team_only',
        label: 'Document Visibility',
        status: 'warn',
        message: 'All linked documents are team-only. Tenants will not see any documents.',
        category: 'documents'
      });
    }

    // Calculate overall status
    const failCount = checks.filter(c => c.status === 'fail').length;
    const warnCount = checks.filter(c => c.status === 'warn').length;
    const passCount = checks.filter(c => c.status === 'pass').length;

    let overallStatus: QualityStatus = 'pass';
    if (failCount > 0) {
      overallStatus = 'fail';
    } else if (warnCount > 0) {
      overallStatus = 'warn';
    }

    return {
      status: overallStatus,
      checks,
      passCount,
      warnCount,
      failCount
    };
  } catch (error) {
    console.error('Quality check error:', error);
    return null;
  }
}
