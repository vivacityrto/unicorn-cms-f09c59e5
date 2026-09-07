/**
 * Pure stage-quality evaluator, extracted from useStageQualityCheck.tsx
 * (Phase 2.6 Packet P6-B "stage quality evaluator" cohort).
 *
 * Both `useStageQualityCheck` (live dashboard display) and
 * `computeStageQuality` (certification guardrail, used before allowing a
 * stage to be certified) computed near-identical A-E checks from their own
 * Supabase-fetched data, with two real, intentional behavioral differences
 * that this extraction preserves rather than silently unifies:
 *
 * 1. `includeGenericEmailPass` / `includeGenericDocumentPass`: the hook adds
 *    a generic "Emails linked" / "Documents linked" pass check for stage
 *    types outside the categories that specifically require them (so a
 *    dashboard viewer sees *something* even for non-required categories).
 *    The certification guardrail (`computeStageQuality`) omits these --
 *    it only cares about the categories that actually gate certification.
 * 2. The "certified integrity" check (section F) is display-only, added by
 *    the hook after calling this evaluator. It is deliberately NOT part of
 *    this shared evaluator and NOT computed by `computeStageQuality`,
 *    since that function IS the certification gate -- checking "is this
 *    already-certified stage still passing" would be circular when the
 *    question being asked is "should this stage be allowed to certify".
 */

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

export interface StageQualitySnapshot {
  title: string | null;
  stageType: string;
  isArchived: boolean;
  teamTaskCount: number;
  clientTaskCount: number;
  emailCount: number;
  tenantEmailCount: number;
  draftEmailCount: number;
  documentCount: number;
  tenantVisibleDocs: number;
  teamOnlyDocs: number;
}

export interface EvaluateStageQualityOptions {
  includeGenericEmailPass: boolean;
  includeGenericDocumentPass: boolean;
}

/**
 * Computes the A-E structure/team-task/client-task/email/document checks
 * from an already-fetched data snapshot. No Supabase calls, no side
 * effects -- callers fetch their own data and pass it in.
 */
export function evaluateStageQualityChecks(
  snapshot: StageQualitySnapshot,
  options: EvaluateStageQualityOptions,
): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const { title, stageType, isArchived, teamTaskCount, clientTaskCount, emailCount, tenantEmailCount, draftEmailCount, documentCount, tenantVisibleDocs, teamOnlyDocs } = snapshot;

  // A) Core structure checks
  if (!title || title.trim() === '') {
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

  if (isArchived) {
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
  if (['onboarding', 'offboarding'].includes(stageType)) {
    if (clientTaskCount === 0) {
      checks.push({
        check_key: 'client_tasks_exist',
        label: 'Client Tasks',
        status: 'fail',
        message: `${stageType === 'onboarding' ? 'Onboarding' : 'Offboarding'} phases require at least one client task.`,
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
  if (['delivery', 'documentation', 'onboarding'].includes(stageType)) {
    if (tenantEmailCount === 0) {
      checks.push({
        check_key: 'tenant_emails_exist',
        label: 'Tenant Emails',
        status: 'warn',
        message: `${stageType.charAt(0).toUpperCase() + stageType.slice(1)} phases should have at least one tenant-facing email.`,
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
  } else if (options.includeGenericEmailPass && emailCount > 0) {
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
  if (['delivery', 'documentation'].includes(stageType)) {
    if (tenantVisibleDocs === 0) {
      checks.push({
        check_key: 'tenant_docs_exist',
        label: 'Tenant Documents',
        status: 'fail',
        message: `${stageType.charAt(0).toUpperCase() + stageType.slice(1)} phases require at least one tenant-visible document.`,
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
  } else if (options.includeGenericDocumentPass && documentCount > 0) {
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

  return checks;
}

/** Appends the display-only "certified integrity" self-check (section F). */
export function appendCertifiedIntegrityCheck(checks: QualityCheck[], isCertified: boolean): QualityCheck[] {
  if (!isCertified) return checks;

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

  return checks;
}

/** Rolls a checks array up into the summary result shape both callers return. */
export function summarizeStageQuality(checks: QualityCheck[]): StageQualityResult {
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
}
