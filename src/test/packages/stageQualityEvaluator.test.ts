/**
 * Parity fixtures for the pure stage-quality evaluator (Phase 2.6 Packet
 * P6-B "stage quality evaluator" extraction).
 *
 * These fixtures encode the exact behavior of the two pre-extraction
 * implementations (useStageQualityCheck's live hook and the standalone
 * computeStageQuality certification guardrail) so a future edit to
 * stageQualityEvaluator.ts can't silently change either caller's output.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateStageQualityChecks,
  appendCertifiedIntegrityCheck,
  summarizeStageQuality,
  type StageQualitySnapshot,
} from '@/hooks/stageQualityEvaluator';

function baseSnapshot(overrides: Partial<StageQualitySnapshot> = {}): StageQualitySnapshot {
  return {
    title: 'Onboarding Kickoff',
    stageType: 'onboarding',
    isArchived: false,
    teamTaskCount: 1,
    clientTaskCount: 1,
    emailCount: 1,
    tenantEmailCount: 1,
    draftEmailCount: 0,
    documentCount: 1,
    tenantVisibleDocs: 1,
    teamOnlyDocs: 0,
    ...overrides,
  };
}

const HOOK_OPTIONS = { includeGenericEmailPass: true, includeGenericDocumentPass: true };
const GUARDRAIL_OPTIONS = { includeGenericEmailPass: false, includeGenericDocumentPass: false };

describe('evaluateStageQualityChecks - structure checks', () => {
  it('fails a missing/blank title', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ title: '' }), HOOK_OPTIONS);
    expect(checks.find(c => c.check_key === 'stage_name')?.status).toBe('fail');
  });

  it('passes a real title', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot(), HOOK_OPTIONS);
    expect(checks.find(c => c.check_key === 'stage_name')?.status).toBe('pass');
  });

  it('fails an empty stage type', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ stageType: '' }), HOOK_OPTIONS);
    expect(checks.find(c => c.check_key === 'stage_type')?.status).toBe('fail');
  });

  it('fails an archived stage', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ isArchived: true }), HOOK_OPTIONS);
    expect(checks.find(c => c.check_key === 'stage_archived')?.status).toBe('fail');
  });
});

describe('evaluateStageQualityChecks - team tasks', () => {
  it('fails zero team tasks', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ teamTaskCount: 0 }), HOOK_OPTIONS);
    expect(checks.find(c => c.check_key === 'team_tasks_exist')?.status).toBe('fail');
  });

  it('passes when at least one team task exists', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ teamTaskCount: 3 }), HOOK_OPTIONS);
    const check = checks.find(c => c.check_key === 'team_tasks_exist');
    expect(check?.status).toBe('pass');
    expect(check?.message).toContain('3 team tasks');
  });
});

describe('evaluateStageQualityChecks - client tasks', () => {
  it('fails zero client tasks for onboarding/offboarding', () => {
    for (const stageType of ['onboarding', 'offboarding']) {
      const checks = evaluateStageQualityChecks(baseSnapshot({ stageType, clientTaskCount: 0 }), HOOK_OPTIONS);
      expect(checks.find(c => c.check_key === 'client_tasks_exist')?.status).toBe('fail');
    }
  });

  it('only warns (never fails) on zero client tasks for other stage types', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ stageType: 'delivery', clientTaskCount: 0 }), HOOK_OPTIONS);
    expect(checks.find(c => c.check_key === 'client_tasks_exist')?.status).toBe('warn');
  });
});

describe('evaluateStageQualityChecks - emails: required-category stage types', () => {
  it.each(['delivery', 'documentation', 'onboarding'])('warns on zero tenant emails for %s', (stageType) => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ stageType, tenantEmailCount: 0 }), HOOK_OPTIONS);
    expect(checks.find(c => c.check_key === 'tenant_emails_exist')?.status).toBe('warn');
  });

  it('passes when tenant emails exist', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ stageType: 'delivery', tenantEmailCount: 2 }), HOOK_OPTIONS);
    expect(checks.find(c => c.check_key === 'tenant_emails_exist')?.status).toBe('pass');
  });

  it('warns on draft emails regardless of stage type', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ draftEmailCount: 1 }), HOOK_OPTIONS);
    expect(checks.find(c => c.check_key === 'draft_emails')?.status).toBe('warn');
  });
});

describe('evaluateStageQualityChecks - emails: generic fallback (hook vs guardrail parity)', () => {
  it('hook options add a generic pass check for non-required stage types with emails', () => {
    const checks = evaluateStageQualityChecks(
      baseSnapshot({ stageType: 'other', emailCount: 2, tenantEmailCount: 2 }),
      HOOK_OPTIONS,
    );
    const check = checks.find(c => c.check_key === 'tenant_emails_exist');
    expect(check?.status).toBe('pass');
    expect(check?.label).toBe('Emails');
  });

  it('guardrail options omit the generic email check entirely for non-required stage types', () => {
    const checks = evaluateStageQualityChecks(
      baseSnapshot({ stageType: 'other', emailCount: 2, tenantEmailCount: 2 }),
      GUARDRAIL_OPTIONS,
    );
    expect(checks.find(c => c.check_key === 'tenant_emails_exist')).toBeUndefined();
  });
});

describe('evaluateStageQualityChecks - documents: required-category stage types', () => {
  it.each(['delivery', 'documentation'])('fails on zero tenant-visible documents for %s', (stageType) => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ stageType, tenantVisibleDocs: 0, documentCount: 0 }), HOOK_OPTIONS);
    expect(checks.find(c => c.check_key === 'tenant_docs_exist')?.status).toBe('fail');
  });

  it('passes when tenant-visible documents exist', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ stageType: 'delivery', tenantVisibleDocs: 1 }), HOOK_OPTIONS);
    expect(checks.find(c => c.check_key === 'tenant_docs_exist')?.status).toBe('pass');
  });

  it('warns when every linked document is team-only', () => {
    const checks = evaluateStageQualityChecks(
      baseSnapshot({ stageType: 'delivery', documentCount: 2, tenantVisibleDocs: 0, teamOnlyDocs: 2 }),
      HOOK_OPTIONS,
    );
    expect(checks.find(c => c.check_key === 'all_docs_team_only')?.status).toBe('warn');
  });
});

describe('evaluateStageQualityChecks - documents: generic fallback (hook vs guardrail parity)', () => {
  it('hook options add a generic pass check for non-required stage types with documents', () => {
    const checks = evaluateStageQualityChecks(
      baseSnapshot({ stageType: 'other', documentCount: 2, tenantVisibleDocs: 2 }),
      HOOK_OPTIONS,
    );
    const check = checks.find(c => c.check_key === 'tenant_docs_exist');
    expect(check?.status).toBe('pass');
    expect(check?.label).toBe('Documents');
  });

  it('guardrail options omit the generic document check entirely for non-required stage types', () => {
    const checks = evaluateStageQualityChecks(
      baseSnapshot({ stageType: 'other', documentCount: 2, tenantVisibleDocs: 2 }),
      GUARDRAIL_OPTIONS,
    );
    expect(checks.find(c => c.check_key === 'tenant_docs_exist')).toBeUndefined();
  });
});

describe('appendCertifiedIntegrityCheck - hook-only display check', () => {
  it('adds nothing when the stage is not certified', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot(), HOOK_OPTIONS);
    const before = checks.length;
    appendCertifiedIntegrityCheck(checks, false);
    expect(checks.length).toBe(before);
  });

  it('adds a fail when a certified stage has failing checks', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ teamTaskCount: 0 }), HOOK_OPTIONS);
    appendCertifiedIntegrityCheck(checks, true);
    expect(checks.find(c => c.check_key === 'certified_integrity')?.status).toBe('fail');
  });

  it('adds a warn when a certified stage has only warnings', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ stageType: 'other', clientTaskCount: 0 }), HOOK_OPTIONS);
    appendCertifiedIntegrityCheck(checks, true);
    expect(checks.find(c => c.check_key === 'certified_integrity')?.status).toBe('warn');
  });

  it('adds a pass when a certified stage passes every check', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot(), HOOK_OPTIONS);
    appendCertifiedIntegrityCheck(checks, true);
    expect(checks.find(c => c.check_key === 'certified_integrity')?.status).toBe('pass');
  });
});

describe('summarizeStageQuality - overall status rollup', () => {
  it('is fail if any check fails, regardless of warnings', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ teamTaskCount: 0, clientTaskCount: 0, stageType: 'delivery' }), HOOK_OPTIONS);
    expect(summarizeStageQuality(checks).status).toBe('fail');
  });

  it('is warn if there are warnings but no failures', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ stageType: 'other', clientTaskCount: 0 }), HOOK_OPTIONS);
    expect(summarizeStageQuality(checks).status).toBe('warn');
  });

  it('is pass when every check passes', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot(), HOOK_OPTIONS);
    expect(summarizeStageQuality(checks).status).toBe('pass');
  });

  it('counts pass/warn/fail correctly', () => {
    const checks = evaluateStageQualityChecks(baseSnapshot({ teamTaskCount: 0, stageType: 'other', clientTaskCount: 0 }), HOOK_OPTIONS);
    const result = summarizeStageQuality(checks);
    expect(result.failCount + result.warnCount + result.passCount).toBe(checks.length);
    expect(result.failCount).toBeGreaterThan(0);
    expect(result.warnCount).toBeGreaterThan(0);
  });
});
