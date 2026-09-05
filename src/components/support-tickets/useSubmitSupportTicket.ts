import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSuggestDropdowns, SuggestDropdownItem } from '@/hooks/useSuggestDropdowns';
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import { TICKET_TYPE_BY_KEY, TicketTypeKey } from './ticketTypeConfig';

export interface AnyFormValues {
  title: string;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  trying_to_do?: string;
  what_happened?: string;
  error_message?: string;
  affected_areas?: string[] | null;
  feature_context?: string;
  improvement_context?: string;
}

function findByCode(items: SuggestDropdownItem[], code: string) {
  return items.find((i) => i.code === code);
}

function lowestSortOrder(items: SuggestDropdownItem[]) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order)[0];
}

function buildDescription(type: TicketTypeKey, v: AnyFormValues): string {
  if (type === 'broken') {
    return `Trying to: ${v.trying_to_do ?? ''}\n\nWhat happened: ${v.what_happened ?? ''}`;
  }
  return v.description ?? '';
}

export function useSubmitSupportTicket() {
  const { user, profile } = useAuth();
  const dropdowns = useSuggestDropdowns();
  const queryClient = useQueryClient();

  const isVivacityStaff = profile?.is_vivacity_internal === true;
  const tenantId = isVivacityStaff ? VIVACITY_TENANT_ID : profile?.tenant_id ?? null;

  const submit = useCallback(
    async (type: TicketTypeKey, formValues: AnyFormValues) => {
      if (!user) {
        toast({ title: 'Not signed in', variant: 'destructive' });
        return false;
      }
      if (!tenantId) {
        toast({ title: 'Select a tenant to raise a ticket', variant: 'destructive' });
        return false;
      }

      const cfg = TICKET_TYPE_BY_KEY[type];
      const urgency = formValues.urgency ?? 'medium';

      const itemType = findByCode(dropdowns.itemTypes, cfg.typeCode);
      const status = findByCode(dropdowns.statuses, 'new');
      const priority = findByCode(dropdowns.priorities, urgency);
      const impact = lowestSortOrder(dropdowns.impactRatings);
      const releaseStatus =
        findByCode(dropdowns.releaseStatuses, 'not_released') ??
        lowestSortOrder(dropdowns.releaseStatuses);

      const missing: string[] = [];
      if (!itemType) missing.push(`dd_suggest_item_type.${cfg.typeCode}`);
      if (!status) missing.push('dd_suggest_status.new');
      if (!priority) missing.push(`dd_suggest_priority.${urgency}`);
      if (!impact) missing.push('dd_suggest_impact_rating.*');
      if (!releaseStatus) missing.push('dd_suggest_release_status.*');

      if (missing.length) {
        toast({
          title: 'Configuration error',
          description: `Missing lookup code '${missing[0]}'. Contact support.`,
          variant: 'destructive',
        });
        return false;
      }

      const areas = formValues.affected_areas && formValues.affected_areas.length > 0
        ? formValues.affected_areas
        : null;

      const payload = {
        tenant_id: tenantId,
        suggest_item_type_id: itemType!.id,
        suggest_status_id: status!.id,
        suggest_priority_id: priority!.id,
        suggest_impact_rating_id: impact!.id,
        suggest_release_status_id: releaseStatus!.id,
        suggest_category_id: null,
        title: formValues.title,
        description: buildDescription(type, formValues),
        urgency,
        trying_to_do: formValues.trying_to_do ?? null,
        what_happened: formValues.what_happened ?? null,
        error_message: formValues.error_message ?? null,
        affected_areas: areas,
        feature_context: formValues.feature_context ?? null,
        improvement_context: formValues.improvement_context ?? null,
        reported_by: user.id,
        created_by: user.id,
        updated_by: user.id,
        is_client_visible: false,
        source_page_url: window.location.href,
        source_page_label: document.title,
        title_generated_by_ai: false,
      };

      const { error } = await supabase.from('suggest_items').insert(payload);
      if (error) {
        toast({ title: 'Failed to submit ticket', description: error.message, variant: 'destructive' });
        return false;
      }

      toast({ title: "Support ticket submitted — we'll be in touch shortly." });
      queryClient.invalidateQueries({ queryKey: ['suggest-items'] });
      return true;
    },
    [user, tenantId, dropdowns, queryClient]
  );

  return {
    submit,
    isLoading: dropdowns.isLoading,
    hasTenant: !!tenantId,
  };
}
