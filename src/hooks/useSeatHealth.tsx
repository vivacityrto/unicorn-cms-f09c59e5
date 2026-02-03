import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import { VIVACITY_TENANT_ID } from './useVivacityTeamUsers';
import type { 
  SeatHealthScore, 
  SeatRebalancingRecommendation, 
  HealthBand,
  ContributingFactor,
  RecommendationStatus 
} from '@/types/seatHealth';
import { HEALTH_THRESHOLDS, SCORE_WEIGHTS } from '@/types/seatHealth';

// Get current quarter info
function getCurrentQuarter() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const quarter = Math.floor(month / 3) + 1;
  return { quarter_year: year, quarter_number: quarter };
}

// Calculate health band from total score
function getHealthBand(score: number): HealthBand {
  if (score <= HEALTH_THRESHOLDS.healthy.max) return 'healthy';
  if (score <= HEALTH_THRESHOLDS.at_risk.max) return 'at_risk';
  return 'overloaded';
}

interface RawSeatData {
  seat_id: string;
  owner_id: string | null;
  active_rocks_count: number;
  off_track_rocks_count: number;
  overdue_todos_count: number;
  total_todos_count: number;
  completed_todos_count: number;
  open_critical_issues_count: number;
  old_issues_count: number;
  meetings_attended: number;
  meetings_missed: number;
  gwc_capacity_no: boolean;
  gwc_declining: boolean;
}

// Calculate seat health score from raw data
function calculateSeatHealth(data: RawSeatData): {
  rocks_score: number;
  todos_score: number;
  ids_score: number;
  cadence_score: number;
  gwc_score: number;
  total_score: number;
  health_band: HealthBand;
  contributing_factors: ContributingFactor[];
} {
  const factors: ContributingFactor[] = [];
  
  // 1. Rocks Score (40%) - higher is worse
  let rocksScore = 0;
  if (data.active_rocks_count > 3) {
    rocksScore += 30; // Too many rocks
    factors.push({
      type: 'rocks',
      label: 'High Rock Load',
      description: `${data.active_rocks_count} active Rocks (recommended: 3)`,
      score: 30,
      severity: data.active_rocks_count > 5 ? 'high' : 'medium',
    });
  }
  if (data.off_track_rocks_count > 0) {
    const offTrackPenalty = Math.min(data.off_track_rocks_count * 20, 50);
    rocksScore += offTrackPenalty;
    factors.push({
      type: 'rocks',
      label: 'Off-Track Rocks',
      description: `${data.off_track_rocks_count} Rock(s) off track`,
      score: offTrackPenalty,
      severity: data.off_track_rocks_count >= 2 ? 'high' : 'medium',
    });
  }
  rocksScore = Math.min(rocksScore, 100);
  
  // 2. To-Do Score (20%)
  let todosScore = 0;
  if (data.overdue_todos_count >= 5) {
    todosScore += 60;
    factors.push({
      type: 'todos',
      label: 'Overdue To-Dos',
      description: `${data.overdue_todos_count} overdue To-Dos`,
      score: 60,
      severity: 'high',
    });
  } else if (data.overdue_todos_count > 0) {
    todosScore += data.overdue_todos_count * 10;
    factors.push({
      type: 'todos',
      label: 'Overdue To-Dos',
      description: `${data.overdue_todos_count} overdue To-Dos`,
      score: data.overdue_todos_count * 10,
      severity: 'medium',
    });
  }
  
  // Completion rate check
  if (data.total_todos_count > 0) {
    const completionRate = data.completed_todos_count / data.total_todos_count;
    if (completionRate < 0.7) {
      todosScore += 30;
      factors.push({
        type: 'todos',
        label: 'Low Completion Rate',
        description: `${Math.round(completionRate * 100)}% To-Do completion (target: 70%)`,
        score: 30,
        severity: completionRate < 0.5 ? 'high' : 'medium',
      });
    }
  }
  todosScore = Math.min(todosScore, 100);
  
  // 3. IDS Pressure Score (20%)
  let idsScore = 0;
  if (data.open_critical_issues_count > 0) {
    idsScore += 50;
    factors.push({
      type: 'ids',
      label: 'Critical Issues Open',
      description: `${data.open_critical_issues_count} critical issue(s) require attention`,
      score: 50,
      severity: 'high',
    });
  }
  if (data.old_issues_count > 0) {
    idsScore += 30;
    factors.push({
      type: 'ids',
      label: 'Stale Issues',
      description: `${data.old_issues_count} issue(s) open > 30 days`,
      score: 30,
      severity: 'medium',
    });
  }
  idsScore = Math.min(idsScore, 100);
  
  // 4. Cadence Score (10%)
  let cadenceScore = 0;
  if (data.meetings_missed >= 2) {
    cadenceScore += 70;
    factors.push({
      type: 'cadence',
      label: 'Missed Meetings',
      description: `Missed ${data.meetings_missed} Level 10 meetings`,
      score: 70,
      severity: data.meetings_missed >= 3 ? 'high' : 'medium',
    });
  } else if (data.meetings_missed === 1) {
    cadenceScore += 30;
    factors.push({
      type: 'cadence',
      label: 'Missed Meeting',
      description: 'Missed 1 Level 10 meeting',
      score: 30,
      severity: 'low',
    });
  }
  cadenceScore = Math.min(cadenceScore, 100);
  
  // 5. GWC Score (10%)
  let gwcScore = 0;
  if (data.gwc_capacity_no) {
    gwcScore += 80;
    factors.push({
      type: 'gwc',
      label: 'Capacity Issues',
      description: 'Capacity marked "No" in recent QC',
      score: 80,
      severity: 'high',
    });
  }
  if (data.gwc_declining) {
    gwcScore += 40;
    factors.push({
      type: 'gwc',
      label: 'Declining Trend',
      description: 'GWC scores declining over quarters',
      score: 40,
      severity: 'medium',
    });
  }
  gwcScore = Math.min(gwcScore, 100);
  
  // Calculate weighted total
  const totalScore = Math.round(
    rocksScore * SCORE_WEIGHTS.rocks +
    todosScore * SCORE_WEIGHTS.todos +
    idsScore * SCORE_WEIGHTS.ids +
    cadenceScore * SCORE_WEIGHTS.cadence +
    gwcScore * SCORE_WEIGHTS.gwc
  );
  
  // Sort factors by score descending and take top 3
  const topFactors = factors
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  
  return {
    rocks_score: rocksScore,
    todos_score: todosScore,
    ids_score: idsScore,
    cadence_score: cadenceScore,
    gwc_score: gwcScore,
    total_score: totalScore,
    health_band: getHealthBand(totalScore),
    contributing_factors: topFactors,
  };
}

export function useSeatHealth() {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = isSuperAdmin();
  const { quarter_year, quarter_number } = getCurrentQuarter();
  
  // Fetch all seat health scores
  const { data: healthScores, isLoading: scoresLoading, refetch: refetchScores } = useQuery({
    queryKey: ['seat-health-scores', quarter_year, quarter_number],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seat_health_scores')
        .select('*')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .eq('quarter_year', quarter_year)
        .eq('quarter_number', quarter_number);
      
      if (error) throw error;
      return (data || []) as unknown as SeatHealthScore[];
    },
    enabled: isSuper || !!profile?.tenant_id,
  });
  
  // Fetch recommendations
  const { data: recommendations, isLoading: recsLoading } = useQuery({
    queryKey: ['seat-recommendations', quarter_year, quarter_number],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seat_rebalancing_recommendations')
        .select('*')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .neq('status', 'dismissed')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as SeatRebalancingRecommendation[];
    },
    enabled: isSuper || !!profile?.tenant_id,
  });
  
  // Calculate health for all seats
  const calculateAllHealth = useMutation({
    mutationFn: async (seatIds: string[]) => {
      // Fetch raw data for each seat
      const healthResults: SeatHealthScore[] = [];
      
      for (const seatId of seatIds) {
        // Get seat owner
        const { data: assignment } = await supabase
          .from('accountability_seat_assignments')
          .select('user_id')
          .eq('seat_id', seatId)
          .eq('assignment_type', 'Primary')
          .is('end_date', null)
          .maybeSingle();
        
        const ownerId = assignment?.user_id;
        const isVacant = !ownerId;
        
        // For vacant seats, generate recommendation immediately
        if (isVacant) {
          await generateRecommendations(seatId, {
            rocks_score: 0, todos_score: 0, ids_score: 0, cadence_score: 0, gwc_score: 0,
            total_score: 0, health_band: 'healthy', contributing_factors: []
          }, {
            seat_id: seatId, owner_id: null, active_rocks_count: 0, off_track_rocks_count: 0,
            overdue_todos_count: 0, total_todos_count: 0, completed_todos_count: 0,
            open_critical_issues_count: 0, old_issues_count: 0, meetings_attended: 0,
            meetings_missed: 0, gwc_capacity_no: false, gwc_declining: false,
          }, true, 0, false);
          continue;
        }
        
        // Count how many seats this owner has (seat concentration risk)
        const { count: ownerSeatCount } = await supabase
          .from('accountability_seat_assignments')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', ownerId)
          .eq('assignment_type', 'Primary')
          .is('end_date', null);
        
        // Get rocks data - status uses underscores: On_Track, Off_Track, etc.
        const { data: rocks } = await supabase
          .from('eos_rocks')
          .select('id, status')
          .eq('owner_id', ownerId)
          .eq('quarter_year', quarter_year)
          .eq('quarter_number', quarter_number);
        
        const activeRocks = rocks?.filter(r => r.status === 'On_Track' || r.status === 'Off_Track') || [];
        const offTrackRocks = rocks?.filter(r => r.status === 'Off_Track') || [];
        
        // Get todos data
        const { data: todos } = await supabase
          .from('eos_todos')
          .select('id, status, due_date')
          .eq('owner_id', ownerId);
        
        const now = new Date().toISOString();
        const overdueTodos = todos?.filter(t => t.status !== 'Complete' && t.due_date && t.due_date < now) || [];
        const completedTodos = todos?.filter(t => t.status === 'Complete') || [];
        
        // Get issues data
        const { data: issues } = await supabase
          .from('eos_issues')
          .select('id, impact, status, created_at')
          .eq('assigned_to', ownerId)
          .eq('status', 'Open');
        
        const criticalIssues = issues?.filter(i => i.impact?.toLowerCase() === 'critical') || [];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const oldIssues = issues?.filter(i => i.created_at < thirtyDaysAgo) || [];
        
        // Get meeting attendance (last 4 weeks) - uses 'attended' boolean, not status
        const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
        const { data: attendance } = await supabase
          .from('eos_meeting_participants')
          .select('id, attended, meeting_id')
          .eq('user_id', ownerId)
          .gte('created_at', fourWeeksAgo);
        
        const attended = attendance?.filter(a => a.attended === true) || [];
        const missed = attendance?.filter(a => a.attended === false) || [];
        
        // Get GWC data from QC (capacity only - want_it may not exist)
        const { data: fitData } = await supabase
          .from('eos_qc_fit')
          .select('capacity, qc_id')
          .eq('seat_id', seatId)
          .order('created_at', { ascending: false })
          .limit(2);
        
        const gwcCapacityNo = (fitData?.[0] as any)?.capacity === false;
        // For want_it, we need to check separately as field may not exist
        const gwcWantItNo = false; // Will be enhanced when want_it column is available
        const gwcDeclining = fitData && fitData.length >= 2 && 
          (fitData[0] as any)?.capacity === false && (fitData[1] as any)?.capacity === true;
        
        const rawData: RawSeatData = {
          seat_id: seatId,
          owner_id: ownerId,
          active_rocks_count: activeRocks.length,
          off_track_rocks_count: offTrackRocks.length,
          overdue_todos_count: overdueTodos.length,
          total_todos_count: todos?.length || 0,
          completed_todos_count: completedTodos.length,
          open_critical_issues_count: criticalIssues.length,
          old_issues_count: oldIssues.length,
          meetings_attended: attended.length,
          meetings_missed: missed.length,
          gwc_capacity_no: gwcCapacityNo,
          gwc_declining: gwcDeclining,
        };
        
        const healthData = calculateSeatHealth(rawData);
        
        // Upsert health score - use explicit column list to match DB schema
        const { data: upsertedScore, error: upsertError } = await supabase
          .from('seat_health_scores')
          .upsert([{
            tenant_id: VIVACITY_TENANT_ID,
            seat_id: seatId,
            rocks_score: healthData.rocks_score,
            todos_score: healthData.todos_score,
            ids_score: healthData.ids_score,
            cadence_score: healthData.cadence_score,
            gwc_score: healthData.gwc_score,
            total_score: healthData.total_score,
            health_band: healthData.health_band,
            contributing_factors: healthData.contributing_factors as unknown as any,
            quarter_year,
            quarter_number,
            calculated_at: new Date().toISOString(),
          }], {
            onConflict: 'seat_id,quarter_year,quarter_number',
          })
          .select()
          .single();
        
        if (upsertError) throw upsertError;
        healthResults.push(upsertedScore as unknown as SeatHealthScore);
        
        // Log audit event
        await supabase.from('audit_seat_health').insert({
          tenant_id: VIVACITY_TENANT_ID,
          seat_id: seatId,
          user_id: profile?.user_uuid,
          event_type: 'seat_health_calculated',
          details: { 
            health_band: healthData.health_band, 
            total_score: healthData.total_score,
          },
        });
        
        // Generate recommendations if seat is at risk or overloaded
        if (healthData.health_band !== 'healthy') {
          await generateRecommendations(
            seatId, 
            healthData, 
            rawData, 
            false, 
            ownerSeatCount || 1,
            gwcWantItNo
          );
        }
      }
      
      return healthResults;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-health-scores'] });
      queryClient.invalidateQueries({ queryKey: ['seat-recommendations'] });
      toast({ title: 'Seat health calculated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error calculating health', description: error.message, variant: 'destructive' });
    },
  });
  
  // Generate recommendations based on health data - advisory language, no judgement
  async function generateRecommendations(
    seatId: string, 
    healthData: ReturnType<typeof calculateSeatHealth>,
    rawData: RawSeatData,
    isVacant: boolean = false,
    ownerSeatCount: number = 1,
    gwcWantItNo: boolean = false
  ) {
    type RecType = 'reduce_rock_load' | 'move_rock' | 'add_backup' | 'split_seat' | 'seat_redesign' | 'people_review' | 'vacant_seat';
    
    const recommendations: Array<{
      type: RecType;
      title: string;
      description: string;
      trigger_type: string;
      severity: 'high' | 'medium';
    }> = [];
    
    // 1. Vacant seat - high severity
    if (isVacant) {
      recommendations.push({
        type: 'vacant_seat',
        title: 'Seat needs owner',
        description: 'This seat has no primary owner assigned. Consider identifying an appropriate team member.',
        trigger_type: 'vacant_seat',
        severity: 'high',
      });
    }
    
    // 2. High rock load - severity based on count
    if (rawData.active_rocks_count > 3) {
      const isHighSeverity = rawData.active_rocks_count >= 5;
      recommendations.push({
        type: 'reduce_rock_load',
        title: 'Consider Rock load for next quarter',
        description: `This seat has ${rawData.active_rocks_count} active Rocks. The recommended maximum is 3. Consider adjusting priorities for next quarter.`,
        trigger_type: 'high_rock_count',
        severity: isHighSeverity ? 'high' : 'medium',
      });
    }
    
    // 3. Off-track rocks
    if (rawData.off_track_rocks_count >= 2) {
      recommendations.push({
        type: 'move_rock',
        title: 'Review Rock alignment',
        description: `${rawData.off_track_rocks_count} Rock(s) are currently off track. Consider whether any may align better with another seat that has capacity.`,
        trigger_type: 'off_track_rocks',
        severity: 'high',
      });
    } else if (rawData.off_track_rocks_count === 1) {
      recommendations.push({
        type: 'move_rock',
        title: 'Review Rock progress',
        description: 'One Rock is off track. Consider whether support or reallocation may help.',
        trigger_type: 'off_track_rocks',
        severity: 'medium',
      });
    }
    
    // 4. GWC Capacity constraints
    if (rawData.gwc_capacity_no) {
      recommendations.push({
        type: 'add_backup',
        title: 'Consider backup owner',
        description: 'Recent Quarterly Conversation indicates capacity constraints. A secondary owner may help distribute the load.',
        trigger_type: 'capacity_constraint',
        severity: 'high',
      });
    }
    
    // 5. GWC Want It = No - people review
    if (gwcWantItNo) {
      recommendations.push({
        type: 'people_review',
        title: 'Review seat fit',
        description: 'Quarterly Conversation data suggests reviewing this seat assignment during the next planning session.',
        trigger_type: 'gwc_want_it_no',
        severity: 'medium',
      });
    }
    
    // 6. Seat concentration risk (owner has 3+ seats)
    if (ownerSeatCount >= 3) {
      recommendations.push({
        type: 'add_backup',
        title: 'Review seat concentration',
        description: `The owner of this seat holds ${ownerSeatCount} seats. Consider whether backup owners could reduce risk.`,
        trigger_type: 'seat_concentration',
        severity: ownerSeatCount >= 4 ? 'high' : 'medium',
      });
    }
    
    // 7. Chronic overload - seat redesign
    if (healthData.health_band === 'overloaded' && rawData.gwc_declining) {
      recommendations.push({
        type: 'seat_redesign',
        title: 'Consider seat scope',
        description: 'This seat shows ongoing capacity challenges. Consider whether scope clarification or restructuring may help.',
        trigger_type: 'chronic_overload',
        severity: 'high',
      });
    }
    
    // Insert recommendations (avoid duplicates)
    for (const rec of recommendations) {
      // Check for existing active recommendation of same type
      const { data: existing } = await supabase
        .from('seat_rebalancing_recommendations')
        .select('id')
        .eq('seat_id', seatId)
        .eq('recommendation_type', rec.type)
        .in('status', ['new', 'acknowledged'])
        .maybeSingle();
      
      if (!existing) {
        await supabase.from('seat_rebalancing_recommendations').insert({
          tenant_id: VIVACITY_TENANT_ID,
          seat_id: seatId,
          recommendation_type: rec.type,
          title: rec.title,
          description: rec.description,
          status: 'new',
          severity: rec.severity,
          trigger_type: rec.trigger_type,
          quarter_year,
          quarter_number,
        });
        
        // Log audit
        await supabase.from('audit_seat_health').insert({
          tenant_id: VIVACITY_TENANT_ID,
          seat_id: seatId,
          user_id: profile?.user_uuid,
          event_type: 'recommendation_created',
          details: { recommendation_type: rec.type, severity: rec.severity },
        });
      }
    }
  }
  
  // Update recommendation status
  const updateRecommendation = useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      dismissed_reason 
    }: { 
      id: string; 
      status: RecommendationStatus; 
      dismissed_reason?: string;
    }) => {
      const updates: Record<string, unknown> = { status };
      
      if (status === 'acknowledged') {
        updates.acknowledged_at = new Date().toISOString();
        updates.acknowledged_by = profile?.user_uuid;
      } else if (status === 'dismissed') {
        updates.dismissed_at = new Date().toISOString();
        updates.dismissed_by = profile?.user_uuid;
        updates.dismissed_reason = dismissed_reason;
      } else if (status === 'action_taken') {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = profile?.user_uuid;
      }
      
      const { data, error } = await supabase
        .from('seat_rebalancing_recommendations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Log audit
      const eventType = status === 'dismissed' 
        ? 'recommendation_dismissed'
        : status === 'acknowledged'
        ? 'recommendation_acknowledged'
        : 'recommendation_resolved';
      
      await supabase.from('audit_seat_health').insert({
        tenant_id: VIVACITY_TENANT_ID,
        recommendation_id: id,
        user_id: profile?.user_uuid,
        event_type: eventType,
        reason: dismissed_reason,
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seat-recommendations'] });
      toast({ title: 'Recommendation updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating recommendation', description: error.message, variant: 'destructive' });
    },
  });
  
  // Get health for a specific seat
  const getSeatHealth = (seatId: string): SeatHealthScore | undefined => {
    return healthScores?.find(h => h.seat_id === seatId);
  };
  
  // Get recommendations for a specific seat
  const getSeatRecommendations = (seatId: string): SeatRebalancingRecommendation[] => {
    return recommendations?.filter(r => r.seat_id === seatId) || [];
  };
  
  // Get worst seats (for watchlist)
  const getWorstSeats = (limit: number = 5): SeatHealthScore[] => {
    if (!healthScores) return [];
    return [...healthScores]
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, limit);
  };
  
  return {
    healthScores,
    recommendations,
    isLoading: scoresLoading || recsLoading,
    calculateAllHealth,
    updateRecommendation,
    getSeatHealth,
    getSeatRecommendations,
    getWorstSeats,
    refetchScores,
    getCurrentQuarter: () => ({ quarter_year, quarter_number }),
  };
}
