import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

const VIVACITY_TENANT_ID = 6372;

export interface SeatSuccessionStatus {
  seatId: string;
  seatName: string;
  criticalSeat: boolean;
  coverRequired: boolean;
  coverNotes: string | null;
  primaryOwnerUserId: string | null;
  primaryOwnerName: string;
  primaryOnLeave: boolean;
  backupOwnerUserId: string | null;
  backupOwnerName: string | null;
  backupOnLeave: boolean;
  coverageStatus: 'fully_covered' | 'primary_only' | 'uncovered';
  coverActive: boolean; // Primary on leave and backup available
  isAtRisk: boolean; // Critical seat with no backup, or both unavailable
}

export interface SuccessionRisk {
  type: 'no_backup_critical' | 'both_unavailable' | 'overloaded_no_backup' | 'same_backup_multiple';
  severity: 'high' | 'medium' | 'low';
  seatId: string;
  seatName: string;
  primaryOwnerName: string;
  backupOwnerName: string | null;
  detail: string;
}

export interface SuccessionAuditEvent {
  seatId: string;
  eventType: 'backup_assigned' | 'backup_removed' | 'seat_marked_critical' | 'seat_unmarked_critical' | 'cover_activated' | 'cover_deactivated';
  details?: Record<string, string | number | boolean | null>;
}

/**
 * Hook for Seat Succession and Contingency Planning
 * Manages backup owners, leave detection, and cover activation
 * Internal to Vivacity Team only
 */
export function useSeatSuccession() {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = isSuperAdmin();
  const isTeamLeader = profile?.unicorn_role === 'Team Leader';
  const canEdit = isSuper || isTeamLeader;

  // Fetch succession status for all seats
  const successionQuery = useQuery({
    queryKey: ['seat-succession'],
    queryFn: async (): Promise<SeatSuccessionStatus[]> => {
      // Fetch seats with succession fields
      const { data: seats, error: seatsError } = await supabase
        .from('accountability_seats')
        .select(`
          id,
          seat_name,
          critical_seat,
          cover_required,
          cover_notes,
          backup_owner_user_id
        `)
        .eq('tenant_id', VIVACITY_TENANT_ID);

      if (seatsError) throw seatsError;

      // Fetch primary assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from('accountability_seat_assignments')
        .select('seat_id, user_id, assignment_type')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .eq('assignment_type', 'Primary')
        .is('end_date', null);

      if (assignmentsError) throw assignmentsError;

      // Fetch users with leave info
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, leave_from, leave_until')
        .in('unicorn_role', ['Super Admin', 'Team Leader', 'Team Member'])
        .eq('archived', false);

      if (usersError) throw usersError;

      const now = new Date();

      const isOnLeave = (user: typeof users[0] | undefined): boolean => {
        if (!user?.leave_from || !user?.leave_until) return false;
        const from = new Date(user.leave_from);
        const until = new Date(user.leave_until);
        return now >= from && now <= until;
      };

      const getUserName = (userId: string | null): string | null => {
        if (!userId) return null;
        const user = users.find(u => u.user_uuid === userId);
        if (!user) return null;
        if (user.first_name || user.last_name) {
          return `${user.first_name || ''} ${user.last_name || ''}`.trim();
        }
        return 'Unknown';
      };

      // Build assignment map
      const primaryOwnerMap = new Map<string, string>();
      assignments?.forEach(a => {
        if (a.assignment_type === 'Primary') {
          primaryOwnerMap.set(a.seat_id, a.user_id);
        }
      });

      // Map succession status
      return (seats || []).map(seat => {
        const primaryOwnerId = primaryOwnerMap.get(seat.id) || null;
        const primaryUser = users.find(u => u.user_uuid === primaryOwnerId);
        const backupUser = users.find(u => u.user_uuid === seat.backup_owner_user_id);
        
        const primaryOnLeave = isOnLeave(primaryUser);
        const backupOnLeave = isOnLeave(backupUser);
        
        const coverageStatus: 'fully_covered' | 'primary_only' | 'uncovered' = 
          !primaryOwnerId ? 'uncovered' :
          seat.backup_owner_user_id ? 'fully_covered' : 'primary_only';
        
        // Cover is active when primary is on leave and backup is available
        const coverActive = primaryOnLeave && !!seat.backup_owner_user_id && !backupOnLeave;
        
        // At risk: critical seat with issues
        const isAtRisk = (seat.critical_seat && !seat.backup_owner_user_id) || 
                         (primaryOnLeave && (!seat.backup_owner_user_id || backupOnLeave)) ||
                         (!primaryOwnerId);

        return {
          seatId: seat.id,
          seatName: seat.seat_name,
          criticalSeat: seat.critical_seat || false,
          coverRequired: seat.cover_required || false,
          coverNotes: seat.cover_notes || null,
          primaryOwnerUserId: primaryOwnerId,
          primaryOwnerName: getUserName(primaryOwnerId) || 'Vacant',
          primaryOnLeave,
          backupOwnerUserId: seat.backup_owner_user_id || null,
          backupOwnerName: getUserName(seat.backup_owner_user_id),
          backupOnLeave,
          coverageStatus,
          coverActive,
          isAtRisk,
        };
      });
    },
    enabled: true,
    staleTime: 1000 * 60 * 2,
  });

  // Calculate succession risks
  const successionRisks: SuccessionRisk[] = [];
  
  if (successionQuery.data) {
    const seats = successionQuery.data;
    
    // Track backup usage
    const backupUsage = new Map<string, string[]>();
    seats.forEach(seat => {
      if (seat.backupOwnerUserId) {
        const current = backupUsage.get(seat.backupOwnerUserId) || [];
        current.push(seat.seatId);
        backupUsage.set(seat.backupOwnerUserId, current);
      }
    });

    seats.forEach(seat => {
      // Critical seat with no backup
      if (seat.criticalSeat && !seat.backupOwnerUserId) {
        successionRisks.push({
          type: 'no_backup_critical',
          severity: 'high',
          seatId: seat.seatId,
          seatName: seat.seatName,
          primaryOwnerName: seat.primaryOwnerName,
          backupOwnerName: null,
          detail: 'Critical seat has no backup owner assigned',
        });
      }

      // Both primary and backup unavailable
      if (seat.primaryOnLeave && seat.backupOwnerUserId && seat.backupOnLeave) {
        successionRisks.push({
          type: 'both_unavailable',
          severity: 'high',
          seatId: seat.seatId,
          seatName: seat.seatName,
          primaryOwnerName: seat.primaryOwnerName,
          backupOwnerName: seat.backupOwnerName,
          detail: 'Primary and backup are both unavailable',
        });
      }

      // Backup covers too many seats
      if (seat.backupOwnerUserId) {
        const usage = backupUsage.get(seat.backupOwnerUserId) || [];
        if (usage.length > 2) {
          successionRisks.push({
            type: 'same_backup_multiple',
            severity: 'medium',
            seatId: seat.seatId,
            seatName: seat.seatName,
            primaryOwnerName: seat.primaryOwnerName,
            backupOwnerName: seat.backupOwnerName,
            detail: `Backup covers ${usage.length} seats`,
          });
        }
      }
    });
  }

  // Mutation: Update backup owner
  const updateBackupOwnerMutation = useMutation({
    mutationFn: async ({ seatId, backupUserId }: { seatId: string; backupUserId: string | null }) => {
      const { error } = await supabase
        .from('accountability_seats')
        .update({ backup_owner_user_id: backupUserId })
        .eq('id', seatId);

      if (error) throw error;

      // Log audit event
      await logSuccessionEvent({
        seatId,
        eventType: backupUserId ? 'backup_assigned' : 'backup_removed',
        details: { backupUserId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-succession'] });
      toast.success('Backup owner updated');
    },
    onError: (error) => {
      console.error('Failed to update backup owner:', error);
      toast.error('Failed to update backup owner');
    },
  });

  // Mutation: Mark seat as critical
  const updateCriticalSeatMutation = useMutation({
    mutationFn: async ({ seatId, critical }: { seatId: string; critical: boolean }) => {
      const { error } = await supabase
        .from('accountability_seats')
        .update({ critical_seat: critical })
        .eq('id', seatId);

      if (error) throw error;

      await logSuccessionEvent({
        seatId,
        eventType: critical ? 'seat_marked_critical' : 'seat_unmarked_critical',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-succession'] });
      toast.success('Seat criticality updated');
    },
    onError: (error) => {
      console.error('Failed to update critical seat:', error);
      toast.error('Failed to update seat criticality');
    },
  });

  // Mutation: Update cover notes
  const updateCoverNotesMutation = useMutation({
    mutationFn: async ({ seatId, notes }: { seatId: string; notes: string }) => {
      const { error } = await supabase
        .from('accountability_seats')
        .update({ cover_notes: notes })
        .eq('id', seatId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-succession'] });
      toast.success('Cover notes saved');
    },
    onError: (error) => {
      console.error('Failed to save cover notes:', error);
      toast.error('Failed to save cover notes');
    },
  });

  // Log succession audit event
  const logSuccessionEvent = async (event: SuccessionAuditEvent) => {
    try {
      await supabase.from('audit_succession_events').insert([{
        tenant_id: VIVACITY_TENANT_ID,
        seat_id: event.seatId,
        user_id: profile?.user_uuid,
        event_type: event.eventType,
        details: event.details || null,
      }]);
    } catch (error) {
      console.error('Failed to log succession event:', error);
    }
  };

  // Get succession status for a specific seat
  const getSeatSuccession = (seatId: string): SeatSuccessionStatus | null => {
    return successionQuery.data?.find(s => s.seatId === seatId) || null;
  };

  // Get all seats with active cover
  const seatsWithActiveCover = successionQuery.data?.filter(s => s.coverActive) || [];

  // Get all seats at risk
  const seatsAtRisk = successionQuery.data?.filter(s => s.isAtRisk) || [];

  return {
    successionData: successionQuery.data || [],
    successionRisks,
    seatsWithActiveCover,
    seatsAtRisk,
    isLoading: successionQuery.isLoading,
    isError: successionQuery.isError,
    canEdit,
    getSeatSuccession,
    updateBackupOwner: updateBackupOwnerMutation.mutate,
    updateCriticalSeat: updateCriticalSeatMutation.mutate,
    updateCoverNotes: updateCoverNotesMutation.mutate,
    isUpdating: updateBackupOwnerMutation.isPending || 
                updateCriticalSeatMutation.isPending || 
                updateCoverNotesMutation.isPending,
  };
}
