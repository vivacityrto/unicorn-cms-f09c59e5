import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AuditEvent {
  id: string;
  entity: string;
  entity_id: string;
  action: string;
  user_id: string | null;
  details: any;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

interface UseStageAuditLogOptions {
  stageId: number | null;
  dateFrom?: Date;
  dateTo?: Date;
  actionFilter?: string;
  packageIdFilter?: number;
}

export function useStageAuditLog(options: UseStageAuditLogOptions) {
  const { stageId, dateFrom, dateTo, actionFilter, packageIdFilter } = options;
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAuditEvents = useCallback(async () => {
    if (!stageId) {
      setEvents([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Query audit_events for this stage
      let query = supabase
        .from('audit_events')
        .select('*')
        .eq('entity', 'stage')
        .eq('entity_id', stageId.toString())
        .order('created_at', { ascending: false });

      if (dateFrom) {
        query = query.gte('created_at', dateFrom.toISOString());
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo.toISOString());
      }
      if (actionFilter && actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      // Get user info for each event
      const userIds = [...new Set((data || []).filter(e => e.user_id).map(e => e.user_id))];
      let userMap: Record<string, { email: string; name: string }> = {};

      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('user_uuid, email, first_name, last_name')
          .in('user_uuid', userIds);

        (usersData || []).forEach((u: any) => {
          userMap[u.user_uuid] = {
            email: u.email,
            name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email
          };
        });
      }

      // Filter by package_id if specified
      let filteredData = data || [];
      if (packageIdFilter) {
        filteredData = filteredData.filter(e => {
          const details = e.details as Record<string, any> | null;
          return details?.package_id === packageIdFilter || 
                 details?.source_package_id === packageIdFilter;
        });
      }

      // Map events with user info
      const eventsWithUsers: AuditEvent[] = filteredData.map(e => ({
        ...e,
        user_email: e.user_id ? userMap[e.user_id]?.email : undefined,
        user_name: e.user_id ? userMap[e.user_id]?.name : undefined,
      }));

      setEvents(eventsWithUsers);
    } catch (err: any) {
      console.error('Failed to fetch audit events:', err);
      setError(err.message || 'Failed to load audit events');
    } finally {
      setIsLoading(false);
    }
  }, [stageId, dateFrom, dateTo, actionFilter, packageIdFilter]);

  useEffect(() => {
    fetchAuditEvents();
  }, [fetchAuditEvents]);

  // Get unique actions for filter dropdown
  const uniqueActions = [...new Set(events.map(e => e.action))];

  return {
    events,
    isLoading,
    error,
    refetch: fetchAuditEvents,
    uniqueActions,
  };
}

// Helper to format action names
export function formatActionName(action: string): string {
  const actionMap: Record<string, string> = {
    'stage.created': 'Stage Created',
    'stage.updated': 'Stage Updated',
    'stage.duplicated': 'Stage Duplicated',
    'stage.archived': 'Stage Archived',
    'stage.restored': 'Stage Restored',
    'stage.replaced_in_packages': 'Replaced in Packages',
    'stage.exported': 'Stage Exported',
    'stage.imported': 'Stage Imported',
    'stage.certified_edited': 'Certified Template Edited',
  };
  return actionMap[action] || action.replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Helper to generate a summary from details
export function generateAuditSummary(action: string, details: Record<string, any> | null): string {
  if (!details) return '';

  switch (action) {
    case 'stage.duplicated':
      return `Duplicated from stage #${details.source_stage_id}. Content copied: ${details.content_copied ? 'Yes' : 'No'}`;
    case 'stage.replaced_in_packages':
      return `Replaced with stage #${details.new_stage_id} in ${details.updated_count || 0} package(s)`;
    case 'stage.archived':
    case 'stage.restored':
      return details.packages_using ? `Used in ${details.packages_using} package(s)` : '';
    case 'stage.exported':
      return `Exported with ${details.task_count || 0} tasks, ${details.email_count || 0} emails, ${details.document_count || 0} documents`;
    case 'stage.imported':
      return `Imported with ${details.task_count || 0} tasks, ${details.email_count || 0} emails, ${details.document_count || 0} documents`;
    case 'stage.certified_edited':
      return 'Certified template was edited directly';
    default:
      if (details.changes) {
        const changeKeys = Object.keys(details.changes);
        if (changeKeys.length <= 3) {
          return `Changed: ${changeKeys.join(', ')}`;
        }
        return `Changed ${changeKeys.length} fields`;
      }
      return '';
  }
}
