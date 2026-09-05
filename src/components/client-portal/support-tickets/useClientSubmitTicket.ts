import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { useSuggestDropdowns, SuggestDropdownItem } from '@/hooks/useSuggestDropdowns';
import { TICKET_TYPE_BY_KEY, TicketTypeKey } from '@/components/support-tickets/ticketTypeConfig';

export interface AnyFormValues {
  title: string;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  trying_to_do?: string;
  what_happened?: string;
  error_message?: string;
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

export function useClientSubmitTicket() {
  const { user } = useAuth();
  const { activeTenantId } = useClientTenant();
  const dropdowns = useSuggestDropdowns();
  const queryClient = useQueryClient();

  const submit = useCallback(
    async (type: TicketTypeKey, formValues: AnyFormValues) => {
      if (!user) {
        toast({ title: 'Not signed in', variant: 'destructive' });
        return false;
      }
      if (!activeTenantId) {
        toast({ title: 'No tenant context available', variant: 'destructive' });
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
          description: `Missing lookup '${missing[0]}'. Please contact support.`,
          variant: 'destructive',
        });
        return false;
      }

      const payload = {
        tenant_id: activeTenantId,
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
        affected_areas: null,
        feature_context: formValues.feature_context ?? null,
        improvement_context: formValues.improvement_context ?? null,
        reported_by: user.id,
        created_by: user.id,
        updated_by: user.id,
        is_client_visible: false,
        is_deleted: false,
        source_page_url: window.location.href,
        source_page_label: document.title,
        title_generated_by_ai: false,
      };

      const { error } = await supabase.from('suggest_items').insert(payload);
      if (error) {
        toast({ title: 'Failed to submit ticket', description: error.message, variant: 'destructive' });
        return false;
      }

      toast({ title: 'Support ticket submitted — our team will be in touch shortly.' });
      queryClient.invalidateQueries({ queryKey: ['client-support-tickets'] });
      return true;
    },
    [user, activeTenantId, dropdowns, queryClient]
  );

  return {
    submit,
    isLoading: dropdowns.isLoading,
    hasTenant: !!activeTenantId,
  };
}
