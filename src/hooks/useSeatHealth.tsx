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
  // Rock signals
  active_rocks_count: number;
  off_track_rocks_count: number;
  critical_rock_off_track: boolean;
  // Scorecard signals
  measurables_count: number;
  off_track_weeks: number;
  // GWC signals
  gwc_capacity_no: boolean;
  gwc_capacity_consecutive_no: number;
  gwc_declining: boolean;
  // Rollover signals
  rocks_rolled_twice: number;
  rocks_rolled_thrice: number;
  // Legacy fields (kept for backward compatibility)
  overdue_todos_count: number;
  total_todos_count: number;
  completed_todos_count: number;
  open_critical_issues_count: number;
  old_issues_count: number;
  meetings_attended: number;
  meetings_missed: number;
}

// Calculate seat capacity score from raw data (EOS-aligned capacity model)
function calculateSeatHealth(data: RawSeatData): {
  rocks_score: number;
  scorecard_score: number;
  gwc_score: number;
  rollover_score: number;
  // Legacy fields
  todos_score: number;
  ids_score: number;
  cadence_score: number;
  total_score: number;
  health_band: HealthBand;
  contributing_factors: ContributingFactor[];
} {
  const factors: ContributingFactor[] = [];
  
  // 1. Rocks Score (40%) - higher is worse
  let rocksScore = 0;
  if (data.active_rocks_count > 3) {
    const penalty = Math.min((data.active_rocks_count - 3) * 15, 40);
    rocksScore += penalty;
    factors.push({
      type: 'rocks',
      label: 'High Rock Load',
      description: `${data.active_rocks_count} active Rocks (recommended: 3)`,
      score: penalty,
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
  if (data.critical_rock_off_track) {
    rocksScore += 30;
    factors.push({
      type: 'rocks',
      label: 'Critical Rock Off Track',
      description: 'A critical priority Rock is off track',
      score: 30,
      severity: 'high',
    });
  }
  rocksScore = Math.min(rocksScore, 100);
  
  // 2. Scorecard Pressure Score (25%)
  let scorecardScore = 0;
  if (data.off_track_weeks >= 2) {
    const offTrackRate = data.measurables_count > 0 ? data.off_track_weeks / 4 : 0;
    if (offTrackRate >= 0.5) {
      scorecardScore = 80;
      factors.push({
        type: 'scorecard',
        label: 'Scorecard Pressure',
        description: `50%+ off-track for ${data.off_track_weeks} weeks`,
        score: 80,
        severity: 'high',
      });
    } else if (offTrackRate >= 0.25) {
      scorecardScore = 50;
      factors.push({
        type: 'scorecard',
        label: 'Scorecard Strain',
        description: `Measurables off-track for ${data.off_track_weeks} weeks`,
        score: 50,
        severity: 'medium',
      });
    }
  }
  scorecardScore = Math.min(scorecardScore, 100);
  
  // 3. GWC Capacity Score (25%)
  let gwcScore = 0;
  if (data.gwc_capacity_consecutive_no >= 2) {
    gwcScore = 90;
    factors.push({
      type: 'gwc',
      label: 'Persistent Capacity Issues',
      description: `Capacity marked "No" for ${data.gwc_capacity_consecutive_no} consecutive quarters`,
      score: 90,
      severity: 'high',
    });
  } else if (data.gwc_capacity_no) {
    gwcScore = 60;
    factors.push({
      type: 'gwc',
      label: 'Capacity Constraint',
      description: 'Capacity marked "No" in recent QC',
      score: 60,
      severity: 'medium',
    });
  }
  if (data.gwc_declining && gwcScore < 100) {
    gwcScore += 30;
    factors.push({
      type: 'gwc',
      label: 'Declining Trend',
      description: 'GWC Capacity scores declining over quarters',
      score: 30,
      severity: 'medium',
    });
  }
  gwcScore = Math.min(gwcScore, 100);
  
  // 4. Rollover History Score (10%)
  let rolloverScore = 0;
  if (data.rocks_rolled_thrice > 0) {
    rolloverScore = 100;
    factors.push({
      type: 'rollover',
      label: 'Chronic Rollover',
      description: `${data.rocks_rolled_thrice} Rock(s) rolled 3+ times`,
      score: 100,
      severity: 'high',
    });
  } else if (data.rocks_rolled_twice > 0) {
    rolloverScore = 60;
    factors.push({
      type: 'rollover',
      label: 'Rollover Pattern',
      description: `${data.rocks_rolled_twice} Rock(s) rolled twice`,
      score: 60,
      severity: 'medium',
    });
  }
  
  // Calculate weighted total using new capacity-focused weights
  const totalScore = Math.round(
    rocksScore * SCORE_WEIGHTS.rocks +
    scorecardScore * SCORE_WEIGHTS.scorecard +
    gwcScore * SCORE_WEIGHTS.gwc +
    rolloverScore * SCORE_WEIGHTS.rollover
  );
  
  // Sort factors by score descending and take top 3
  const topFactors = factors
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  
  return {
    rocks_score: rocksScore,
    scorecard_score: scorecardScore,
    gwc_score: gwcScore,
    rollover_score: rolloverScore,
    // Legacy fields set to 0
    todos_score: 0,
    ids_score: 0,
    cadence_score: 0,
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
            rocks_score: 0, scorecard_score: 0, gwc_score: 0, rollover_score: 0,
            todos_score: 0, ids_score: 0, cadence_score: 0,
            total_score: 0, health_band: 'healthy', contributing_factors: []
          }, {
            seat_id: seatId, owner_id: null, 
            active_rocks_count: 0, off_track_rocks_count: 0, critical_rock_off_track: false,
            measurables_count: 0, off_track_weeks: 0,
            gwc_capacity_no: false, gwc_capacity_consecutive_no: 0, gwc_declining: false,
            rocks_rolled_twice: 0, rocks_rolled_thrice: 0,
            overdue_todos_count: 0, total_todos_count: 0, completed_todos_count: 0,
            open_critical_issues_count: 0, old_issues_count: 0, meetings_attended: 0,
            meetings_missed: 0,
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
          .select('id, status, priority')
          .eq('owner_id', ownerId)
          .eq('quarter_year', quarter_year)
          .eq('quarter_number', quarter_number);
        
        const activeRocks = rocks?.filter(r => r.status === 'On_Track' || r.status === 'Off_Track') || [];
        const offTrackRocks = rocks?.filter(r => r.status === 'Off_Track') || [];
        const criticalOffTrack = offTrackRocks.some(r => String(r.priority).toLowerCase() === 'critical');
        // Rollover count would need to be tracked separately - default to 0 for now
        const rolledTwice = 0;
        const rolledThrice = 0;
        
        // Get scorecard data
        const { data: scorecards } = await supabase
          .from('seat_scorecards')
          .select('id')
          .eq('seat_id', seatId)
          .eq('status', 'Active')
          .maybeSingle();
        
        let measurablesCount = 0;
        let offTrackWeeks = 0;
        
        if (scorecards?.id) {
          // Get measurable entries for last 4 weeks
          const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
          const { data: entries } = await supabase
            .from('seat_measurable_entries')
            .select('status, week_start_date')
            .eq('tenant_id', VIVACITY_TENANT_ID)
            .gte('week_start_date', fourWeeksAgo.split('T')[0]);
          
          measurablesCount = entries?.length || 0;
          offTrackWeeks = entries?.filter(e => e.status === 'Off Track').length || 0;
        }
        
        // Get GWC data from QC (capacity only - check consecutive No patterns)
        const { data: fitData } = await supabase
          .from('eos_qc_fit')
          .select('capacity, qc_id')
          .eq('seat_id', seatId)
          .order('created_at', { ascending: false })
          .limit(4);
        
        const gwcCapacityNo = (fitData?.[0] as any)?.capacity === false;
        
        // Count consecutive No for capacity
        let consecutiveNo = 0;
        for (const fit of fitData || []) {
          if ((fit as any).capacity === false) {
            consecutiveNo++;
          } else {
            break;
          }
        }
        
        // Check for declining trend
        const gwcDeclining = fitData && fitData.length >= 2 && 
          (fitData[0] as any)?.capacity === false && (fitData[1] as any)?.capacity === true;
        
        // Legacy data fetching (kept for backward compatibility)
        const { data: todos } = await supabase
          .from('eos_todos')
          .select('id, status, due_date')
          .eq('owner_id', ownerId);
        
        const now = new Date().toISOString();
        const overdueTodos = todos?.filter(t => t.status !== 'Complete' && t.due_date && t.due_date < now) || [];
        const completedTodos = todos?.filter(t => t.status === 'Complete') || [];
        
        const { data: issues } = await supabase
          .from('eos_issues')
          .select('id, impact, status, created_at')
          .eq('assigned_to', ownerId)
          .eq('status', 'Open');
        
        const criticalIssues = issues?.filter(i => i.impact?.toLowerCase() === 'critical') || [];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const oldIssues = issues?.filter(i => i.created_at < thirtyDaysAgo) || [];
        
        const fourWeeksAgoMeetings = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
        const { data: attendance } = await supabase
          .from('eos_meeting_participants')
          .select('id, attended, meeting_id')
          .eq('user_id', ownerId)
          .gte('created_at', fourWeeksAgoMeetings);
        
        const attended = attendance?.filter(a => a.attended === true) || [];
        const missed = attendance?.filter(a => a.attended === false) || [];
        
        const rawData: RawSeatData = {
          seat_id: seatId,
          owner_id: ownerId,
          // New capacity signals
          active_rocks_count: activeRocks.length,
          off_track_rocks_count: offTrackRocks.length,
          critical_rock_off_track: criticalOffTrack,
          measurables_count: measurablesCount,
          off_track_weeks: offTrackWeeks,
          gwc_capacity_no: gwcCapacityNo,
          gwc_capacity_consecutive_no: consecutiveNo,
          gwc_declining: gwcDeclining,
          rocks_rolled_twice: rolledTwice,
          rocks_rolled_thrice: rolledThrice,
          // Legacy fields
          overdue_todos_count: overdueTodos.length,
          total_todos_count: todos?.length || 0,
          completed_todos_count: completedTodos.length,
          open_critical_issues_count: criticalIssues.length,
          old_issues_count: oldIssues.length,
          meetings_attended: attended.length,
          meetings_missed: missed.length,
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
            false // gwcWantItNo - not tracked in current data model
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
