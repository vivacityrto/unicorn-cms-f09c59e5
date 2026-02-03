import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import { subDays, subWeeks, differenceInDays, parseISO, startOfQuarter, addDays } from 'date-fns';
import type { 
  EosAlert, 
  AlertType, 
  AlertSeverity, 
  AlertDimension,
  AlertStatus 
} from '@/types/eosAlerts';

/**
 * Hook to manage EOS "Stuck" alerts - detection, display, and lifecycle.
 */
export function useEosAlerts() {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id;
  const isSuper = isSuperAdmin();

  // Fetch existing alerts
  const { data: alerts, isLoading, refetch } = useQuery({
    queryKey: ['eos-alerts', isSuper ? 'all' : tenantId],
    queryFn: async () => {
      let query = supabase
        .from('eos_alerts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!isSuper && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as EosAlert[];
    },
    enabled: isSuper || !!tenantId,
  });

  // Acknowledge alert
  const acknowledgeAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const { data, error } = await supabase
        .from('eos_alerts')
        .update({
          status: 'acknowledged' as AlertStatus,
          acknowledged_by: profile?.user_uuid,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', alertId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-alerts'] });
      toast({ title: 'Alert acknowledged' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error acknowledging alert', description: error.message, variant: 'destructive' });
    },
  });

  // Dismiss alert (requires reason)
  const dismissAlert = useMutation({
    mutationFn: async ({ alertId, reason }: { alertId: string; reason: string }) => {
      if (!reason.trim()) {
        throw new Error('Dismiss reason is required');
      }
      
      const { data, error } = await supabase
        .from('eos_alerts')
        .update({
          status: 'dismissed' as AlertStatus,
          dismiss_reason: reason,
          dismissed_by: profile?.user_uuid,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', alertId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-alerts'] });
      toast({ title: 'Alert dismissed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error dismissing alert', description: error.message, variant: 'destructive' });
    },
  });

  // Mark as actioned
  const actionAlert = useMutation({
    mutationFn: async (alertId: string) => {
      const { data, error } = await supabase
        .from('eos_alerts')
        .update({
          status: 'actioned' as AlertStatus,
        })
        .eq('id', alertId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-alerts'] });
      toast({ title: 'Alert marked as in progress' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating alert', description: error.message, variant: 'destructive' });
    },
  });

  // Create alert
  const createAlert = useMutation({
    mutationFn: async (alert: Omit<EosAlert, 'id' | 'created_at' | 'status'>) => {
      const { data, error } = await supabase
        .from('eos_alerts')
        .insert({
          ...alert,
          status: 'new' as AlertStatus,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eos-alerts'] });
    },
    onError: (error: Error) => {
      console.error('Error creating alert:', error.message);
    },
  });

  // Filter helpers
  const activeAlerts = alerts?.filter(a => a.status !== 'dismissed' && !a.resolved_at) || [];
  const newAlerts = alerts?.filter(a => a.status === 'new') || [];
  const attentionRequired = activeAlerts.filter(a => a.severity === 'attention_required' || a.severity === 'intervention_required');

  // Get alerts by dimension
  const getAlertsByDimension = (dimension: AlertDimension) => 
    activeAlerts.filter(a => a.dimension === dimension);

  return {
    alerts,
    activeAlerts,
    newAlerts,
    attentionRequired,
    isLoading,
    refetch,
    acknowledgeAlert,
    dismissAlert,
    actionAlert,
    createAlert,
    getAlertsByDimension,
  };
}

/**
 * Hook to detect stuck conditions and create alerts.
 * Runs detection logic against current EOS data.
 */
export function useStuckDetection() {
  const { profile, isSuperAdmin } = useAuth();
  const tenantId = profile?.tenant_id;
  const isSuper = isSuperAdmin();
  const { alerts, createAlert } = useEosAlerts();

  const detectAndCreateAlerts = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('No tenant ID');

      const now = new Date();
      const twoWeeksAgo = subWeeks(now, 2);
      const fourteenDaysAgo = subDays(now, 14);
      const thirtyDaysAgo = subDays(now, 30);
      const sevenDaysAgo = subDays(now, 7);
      const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
      const currentYear = now.getFullYear();
      const quarterStart = startOfQuarter(now);

      // Fetch all relevant data
      const [meetingsRes, rocksRes, issuesRes, qcsRes, flightPlansRes] = await Promise.all([
        supabase
          .from('eos_meetings')
          .select('id, meeting_type, status, is_complete, scheduled_date, title')
          .eq('tenant_id', tenantId)
          .eq('meeting_type', 'L10')
          .gte('scheduled_date', twoWeeksAgo.toISOString())
          .order('scheduled_date', { ascending: false }),
        supabase
          .from('eos_rocks')
          .select('id, title, owner_id, status, quarter_year, quarter_number, created_at, due_date')
          .eq('tenant_id', tenantId)
          .eq('quarter_year', currentYear)
          .eq('quarter_number', currentQuarter),
        supabase
          .from('eos_issues')
          .select('id, title, status, priority, created_at, escalated_at')
          .eq('tenant_id', tenantId)
          .in('status', ['Open', 'Discussing']),
        supabase
          .from('eos_qc')
          .select('id, status, quarter_start, quarter_end, scheduled_at, completed_at')
          .eq('tenant_id', tenantId),
        supabase
          .from('eos_flight_plans')
          .select('id, quarter_number, quarter_year')
          .eq('tenant_id', tenantId)
          .eq('quarter_year', currentYear)
          .eq('quarter_number', currentQuarter),
      ]);

      const meetings = meetingsRes.data || [];
      const rocks = rocksRes.data || [];
      const issues = issuesRes.data || [];
      const qcs = qcsRes.data || [];
      const flightPlans = flightPlansRes.data || [];

      const alertsToCreate: Omit<EosAlert, 'id' | 'created_at' | 'status'>[] = [];

      // 1. CADENCE STUCK DETECTION
      const completedL10s = meetings.filter(m => m.is_complete || m.status === 'completed' || m.status === 'closed');
      const lastL10Date = meetings.length > 0 ? parseISO(meetings[0].scheduled_date) : null;
      const daysSinceL10 = lastL10Date ? differenceInDays(now, lastL10Date) : 999;

      // No L10 in 14 days
      if (daysSinceL10 >= 14) {
        const existingAlert = alerts?.find(a => 
          a.alert_type === 'cadence_stuck' && 
          a.status !== 'dismissed' &&
          !a.resolved_at
        );
        
        if (!existingAlert) {
          alertsToCreate.push({
            tenant_id: tenantId,
            alert_type: 'cadence_stuck',
            severity: daysSinceL10 >= 21 ? 'intervention_required' : 'attention_required',
            dimension: 'cadence',
            message: `No Level 10 meeting held in ${daysSinceL10} days`,
            details: {
              since: lastL10Date?.toISOString() || 'Never',
              days_stuck: daysSinceL10,
              why_it_matters: 'Weekly L10s are the heartbeat of EOS. Missing them breaks cadence and loses momentum.',
              suggested_action: 'Schedule and complete a Level 10 meeting this week.',
              link: '/eos/meetings',
            },
          });
        }
      }

      // 2 consecutive L10s missed/not closed
      const unclosedL10s = meetings.filter(m => 
        !m.is_complete && m.status !== 'completed' && m.status !== 'closed'
      );
      if (unclosedL10s.length >= 2) {
        const existingAlert = alerts?.find(a => 
          a.alert_type === 'cadence_stuck' && 
          a.details?.sub_type === 'unclosed' &&
          a.status !== 'dismissed' &&
          !a.resolved_at
        );
        
        if (!existingAlert) {
          alertsToCreate.push({
            tenant_id: tenantId,
            alert_type: 'cadence_stuck',
            severity: 'attention_required',
            dimension: 'cadence',
            message: `${unclosedL10s.length} consecutive Level 10 meetings not properly closed`,
            details: {
              sub_type: 'unclosed',
              why_it_matters: 'Unclosed meetings mean outcomes aren\'t captured and to-dos may be lost.',
              suggested_action: 'Review and close past L10 meetings, then capture any missing actions.',
              link: '/eos/meetings',
            },
          });
        }
      }

      // 2. ROCK STUCK DETECTION
      for (const rock of rocks) {
        // Rock with no owner for 7+ days
        if (!rock.owner_id) {
          const createdAt = parseISO(rock.created_at);
          const daysSinceCreated = differenceInDays(now, createdAt);
          
          if (daysSinceCreated >= 7) {
            const existingAlert = alerts?.find(a => 
              a.alert_type === 'rock_stuck' && 
              a.source_entity_id === rock.id &&
              a.status !== 'dismissed' &&
              !a.resolved_at
            );
            
            if (!existingAlert) {
              alertsToCreate.push({
                tenant_id: tenantId,
                alert_type: 'rock_stuck',
                severity: 'attention_required',
                dimension: 'rocks',
                source_entity_id: rock.id,
                source_entity_type: 'eos_rocks',
                message: `Rock "${rock.title}" has no owner for ${daysSinceCreated} days`,
                details: {
                  entity_name: rock.title,
                  days_stuck: daysSinceCreated,
                  why_it_matters: 'Unowned Rocks have no accountability and are unlikely to be completed.',
                  suggested_action: 'Assign an owner to this Rock in the next L10.',
                  link: '/eos/rocks',
                },
              });
            }
          }
        }

        // Rock off-track (would need status history for "2 consecutive weeks" - simplified for now)
        if (rock.status === 'Off_Track') {
          const existingAlert = alerts?.find(a => 
            a.alert_type === 'rock_stuck' && 
            a.source_entity_id === rock.id &&
            a.details?.sub_type === 'off_track' &&
            a.status !== 'dismissed' &&
            !a.resolved_at
          );
          
          if (!existingAlert) {
            alertsToCreate.push({
              tenant_id: tenantId,
              alert_type: 'rock_stuck',
              severity: 'attention_required',
              dimension: 'rocks',
              source_entity_id: rock.id,
              source_entity_type: 'eos_rocks',
              message: `Rock "${rock.title}" is off-track`,
              details: {
                entity_name: rock.title,
                sub_type: 'off_track',
                why_it_matters: 'Off-track Rocks need immediate attention or scope adjustment.',
                suggested_action: 'Discuss in IDS: Does this Rock need help, re-scoping, or dropping?',
                link: '/eos/rocks',
              },
            });
          }
        }
      }

      // 3. IDS STUCK DETECTION
      for (const issue of issues) {
        const createdAt = parseISO(issue.created_at);
        const daysSinceCreated = differenceInDays(now, createdAt);
        const isCritical = issue.priority === 4 || issue.priority === 3;

        // Critical/High open > 30 days
        if (isCritical && daysSinceCreated >= 30) {
          const existingAlert = alerts?.find(a => 
            a.alert_type === 'ids_stuck' && 
            a.source_entity_id === issue.id &&
            a.status !== 'dismissed' &&
            !a.resolved_at
          );
          
          if (!existingAlert) {
            alertsToCreate.push({
              tenant_id: tenantId,
              alert_type: 'ids_stuck',
              severity: daysSinceCreated >= 45 ? 'intervention_required' : 'attention_required',
              dimension: 'ids',
              source_entity_id: issue.id,
              source_entity_type: 'eos_issues',
              message: `Critical issue "${issue.title}" unresolved for ${daysSinceCreated} days`,
              details: {
                entity_name: issue.title,
                days_stuck: daysSinceCreated,
                priority: issue.priority,
                why_it_matters: 'Long-standing critical issues erode trust and create ongoing risk.',
                suggested_action: 'Escalate to leadership or break into smaller actionable steps.',
                link: '/eos/risks-opportunities',
              },
            });
          }
        }

        // Escalated but no action after 7 days
        if (issue.escalated_at) {
          const escalatedAt = parseISO(issue.escalated_at);
          const daysSinceEscalation = differenceInDays(now, escalatedAt);
          
          if (daysSinceEscalation >= 7) {
            const existingAlert = alerts?.find(a => 
              a.alert_type === 'ids_stuck' && 
              a.source_entity_id === issue.id &&
              a.details?.sub_type === 'escalated_stale' &&
              a.status !== 'dismissed' &&
              !a.resolved_at
            );
            
            if (!existingAlert) {
              alertsToCreate.push({
                tenant_id: tenantId,
                alert_type: 'ids_stuck',
                severity: 'intervention_required',
                dimension: 'ids',
                source_entity_id: issue.id,
                source_entity_type: 'eos_issues',
                message: `Escalated issue "${issue.title}" has no action after ${daysSinceEscalation} days`,
                details: {
                  entity_name: issue.title,
                  sub_type: 'escalated_stale',
                  days_stuck: daysSinceEscalation,
                  why_it_matters: 'Escalated issues require leadership attention. Ignoring them defeats the purpose.',
                  suggested_action: 'Leadership must assign ownership and next steps immediately.',
                  link: '/eos/risks-opportunities',
                },
              });
            }
          }
        }
      }

      // 4. PEOPLE SYSTEM STUCK
      // Filter QCs for current quarter by quarter_start/quarter_end dates
      const currentQuarterQCs = qcs.filter(qc => {
        if (qc.quarter_start && qc.quarter_end) {
          const start = parseISO(qc.quarter_start);
          const end = parseISO(qc.quarter_end);
          return now >= start && now <= end;
        }
        return false;
      });

      const overdueQCs = currentQuarterQCs.filter(qc => {
        if (qc.scheduled_at) {
          const scheduledDate = parseISO(qc.scheduled_at);
          return differenceInDays(now, scheduledDate) >= 14 && qc.status !== 'completed';
        }
        return false;
      });

      if (overdueQCs.length > 0) {
        const existingAlert = alerts?.find(a => 
          a.alert_type === 'people_stuck' && 
          a.details?.sub_type === 'overdue' &&
          a.status !== 'dismissed' &&
          !a.resolved_at
        );
        
        if (!existingAlert) {
          alertsToCreate.push({
            tenant_id: tenantId,
            alert_type: 'people_stuck',
            severity: 'attention_required',
            dimension: 'people',
            message: `${overdueQCs.length} Quarterly Conversation${overdueQCs.length > 1 ? 's' : ''} overdue by 14+ days`,
            details: {
              count: overdueQCs.length,
              sub_type: 'overdue',
              why_it_matters: 'Late QCs signal poor people management and erode team trust.',
              suggested_action: 'Complete overdue conversations this week.',
              link: '/eos/qc',
            },
          });
        }
      }

      // Sign-off check - need to look at eos_qc_signoffs table
      const completedQCs = currentQuarterQCs.filter(q => q.status === 'completed');
      // Note: Sign-off data would come from eos_qc_signoffs table - simplified for now

      // 5. QUARTERLY RHYTHM STUCK
      const daysSinceQuarterStart = differenceInDays(now, quarterStart);

      // No flight plan 14 days into quarter
      const hasActivePlan = flightPlans.length > 0; // If flight plan exists for current quarter
      if (daysSinceQuarterStart >= 14 && !hasActivePlan) {
        const existingAlert = alerts?.find(a =>
          a.alert_type === 'quarterly_stuck' && 
          a.details?.sub_type === 'no_plan' &&
          a.status !== 'dismissed' &&
          !a.resolved_at
        );
        
        if (!existingAlert) {
          alertsToCreate.push({
            tenant_id: tenantId,
            alert_type: 'quarterly_stuck',
            severity: daysSinceQuarterStart >= 21 ? 'intervention_required' : 'attention_required',
            dimension: 'quarterly',
            message: `No active Flight Plan ${daysSinceQuarterStart} days into the quarter`,
            details: {
              sub_type: 'no_plan',
              days_into_quarter: daysSinceQuarterStart,
              why_it_matters: 'Without a Flight Plan, the quarter has no direction or accountability.',
              suggested_action: 'Finalize and activate the quarterly Flight Plan immediately.',
              link: '/eos/flight-plan',
            },
          });
        }
      }

      // Create all detected alerts
      for (const alert of alertsToCreate) {
        await createAlert.mutateAsync(alert);
      }

      return { created: alertsToCreate.length };
    },
  });

  return {
    detectAndCreateAlerts,
  };
}
