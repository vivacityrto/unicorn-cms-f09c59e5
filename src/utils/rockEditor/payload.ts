import type { Json } from '@/integrations/supabase/types';
import type { RockEditorValues } from '@/utils/rockEditor/types';

const filled = (values: RockEditorValues) => values.milestones.filter(m => m.title.trim());

/** The body for upsert_rock_with_parenting. Team and client are only sent when the Rock really has them. */
export function buildRockPayload(
  values: RockEditorValues,
  options: {
    tenantId: number;
    /** Present when editing. */
    id?: string;
    status?: string;
    priority?: number;
    /** Edits must resend these: the server function writes whatever it is given. */
    clientTenantId?: number | null;
    rockType?: string;
  },
): Record<string, Json | undefined> {
  const milestones = filled(values);
  const payload: Record<string, Json | undefined> = {
    title: values.title.trim(),
    description: values.description.trim() || null,
    issue: values.issue.trim() || null,
    outcome: values.outcome.trim() || null,
    // The legacy checklist column, kept in step for anything that still reads it.
    milestones: milestones.length > 0
      ? (milestones.map(m => ({ id: m.id, text: m.title.trim(), completed: m.status === 'complete' })) as unknown as Json)
      : null,
    rock_level: values.level,
    function_id: values.level === 'team' ? values.functionId : null,
    owner_id: values.ownerId,
    parent_rock_id: values.level === 'company' ? null : values.parentId,
    quarter_year: values.quarterYear,
    quarter_number: values.quarterNumber,
    due_date: values.dueDate,
    tenant_id: options.tenantId,
  };
  if (options.id) payload.id = options.id;
  if (options.status !== undefined) payload.status = options.status;
  if (options.priority !== undefined) payload.priority = options.priority;
  if (options.clientTenantId !== undefined) payload.client_tenant_id = options.clientTenantId;
  if (options.rockType !== undefined) payload.rock_type = options.rockType;
  return payload;
}

/** Milestone rows for eos_rock_milestones. A blank owner or date means the Rock's own. */
export function buildMilestoneRows(values: RockEditorValues, rockId: string, tenantId: number) {
  return filled(values).map((m, index) => ({
    id: m.id,
    tenant_id: tenantId,
    rock_id: rockId,
    title: m.title.trim(),
    owner_id: m.ownerId ?? values.ownerId,
    due_date: m.dueDate || values.dueDate || null,
    priority: m.priority,
    status: m.status,
    exit_criteria: m.exitCriteria.trim() || null,
    evidence_url: m.evidenceUrl.trim() || null,
    sort_order: index,
  }));
}

/** Individual milestone to Company milestone links. Only an Individual Rock has any. */
export function buildLinkRows(values: RockEditorValues, tenantId: number) {
  if (values.level !== 'individual') return [];
  return filled(values).flatMap(m =>
    [...new Set(m.supports)].map(companyMilestoneId => ({
      tenant_id: tenantId,
      company_milestone_id: companyMilestoneId,
      individual_milestone_id: m.id,
    })),
  );
}
