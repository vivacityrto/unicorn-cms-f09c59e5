import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { 
  RockOutcome, 
  QuarterSummary, 
  SeatRockSummary, 
  SeatFlag,
  TrendData,
  RockOutcomeType 
} from '@/types/rockAnalysis';
import { formatQuarter, getCurrentQuarter, getPreviousQuarter } from '@/types/rockAnalysis';

// Hook to fetch rock outcomes for analysis
export function useRockOutcomes(quarterNumber?: number, quarterYear?: number) {
  const { profile, isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin();
  const tenantId = profile?.tenant_id;
  
  return useQuery({
    queryKey: ['rock-outcomes', tenantId, quarterNumber, quarterYear],
    queryFn: async () => {
      let query = supabase
        .from('rock_outcomes')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!isSuper && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      
      if (quarterNumber && quarterYear) {
        query = query
          .eq('quarter_number', quarterNumber)
          .eq('quarter_year', quarterYear);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as RockOutcome[];
    },
    enabled: isSuper || !!tenantId,
  });
}

// Hook to get quarterly summary statistics
export function useQuarterlySummary(quarterNumber?: number, quarterYear?: number) {
  const { profile, isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin();
  const tenantId = profile?.tenant_id;
  
  return useQuery({
    queryKey: ['rock-quarterly-summary', tenantId, quarterNumber, quarterYear],
    queryFn: async () => {
      let query = supabase
        .from('rock_outcomes')
        .select('outcome_type, quarter_number, quarter_year');
      
      if (!isSuper && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      
      if (quarterNumber && quarterYear) {
        query = query
          .eq('quarter_number', quarterNumber)
          .eq('quarter_year', quarterYear);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Group by quarter
      const quarterMap = new Map<string, RockOutcome[]>();
      (data || []).forEach((outcome: any) => {
        const key = formatQuarter(outcome.quarter_number, outcome.quarter_year);
        if (!quarterMap.has(key)) {
          quarterMap.set(key, []);
        }
        quarterMap.get(key)!.push(outcome);
      });
      
      // Calculate summaries
      const summaries: QuarterSummary[] = [];
      quarterMap.forEach((outcomes, quarterKey) => {
        const total = outcomes.length;
        const completed_on_time = outcomes.filter(o => o.outcome_type === 'completed_on_time').length;
        const completed_late = outcomes.filter(o => o.outcome_type === 'completed_late').length;
        const rolled_forward = outcomes.filter(o => o.outcome_type === 'rolled_forward').length;
        const dropped = outcomes.filter(o => o.outcome_type === 'dropped').length;
        
        const firstOutcome = outcomes[0] as any;
        
        summaries.push({
          quarter: quarterKey,
          quarter_number: firstOutcome.quarter_number,
          quarter_year: firstOutcome.quarter_year,
          total_rocks: total,
          completed_on_time,
          completed_late,
          rolled_forward,
          dropped,
          completion_rate: total > 0 ? Math.round(((completed_on_time + completed_late) / total) * 100) : 0,
          on_time_rate: total > 0 ? Math.round((completed_on_time / total) * 100) : 0,
          roll_rate: total > 0 ? Math.round((rolled_forward / total) * 100) : 0,
          drop_rate: total > 0 ? Math.round((dropped / total) * 100) : 0,
        });
      });
      
      // Sort by quarter (newest first)
      summaries.sort((a, b) => {
        if (a.quarter_year !== b.quarter_year) return b.quarter_year - a.quarter_year;
        return b.quarter_number - a.quarter_number;
      });
      
      return summaries;
    },
    enabled: isSuper || !!tenantId,
  });
}

// Hook to get seat-level rock analysis
export function useSeatRockAnalysis(quarterNumber?: number, quarterYear?: number) {
  const { profile, isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin();
  const tenantId = profile?.tenant_id;
  
  return useQuery({
    queryKey: ['rock-seat-analysis', tenantId, quarterNumber, quarterYear],
    queryFn: async () => {
      // Fetch outcomes with seat info
      let query = supabase
        .from('rock_outcomes')
        .select(`
          *,
          seat:accountability_seats(id, seat_name)
        `);
      
      if (!isSuper && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      
      if (quarterNumber && quarterYear) {
        query = query
          .eq('quarter_number', quarterNumber)
          .eq('quarter_year', quarterYear);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Fetch user names for owners
      const ownerIds = [...new Set((data || []).map((o: any) => o.owner_id).filter(Boolean))];
      let userMap: Record<string, string> = {};
      
      if (ownerIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('user_uuid, first_name, last_name')
          .in('user_uuid', ownerIds);
        
        (users || []).forEach((u: any) => {
          userMap[u.user_uuid] = `${u.first_name || ''} ${u.last_name || ''}`.trim();
        });
      }
      
      // Also fetch historical outcomes for pattern detection
      const { data: allOutcomes } = await supabase
        .from('rock_outcomes')
        .select('seat_id, outcome_type, quarter_year, quarter_number')
        .eq('tenant_id', tenantId || 0);
      
      // Group by seat
      const seatMap = new Map<string, any[]>();
      (data || []).forEach((outcome: any) => {
        const seatId = outcome.seat_id || 'unassigned';
        if (!seatMap.has(seatId)) {
          seatMap.set(seatId, []);
        }
        seatMap.get(seatId)!.push(outcome);
      });
      
      // Build seat summaries
      const summaries: SeatRockSummary[] = [];
      
      seatMap.forEach((outcomes, seatId) => {
        const firstOutcome = outcomes[0];
        const total = outcomes.length;
        const completed_on_time = outcomes.filter((o: any) => o.outcome_type === 'completed_on_time').length;
        const completed_late = outcomes.filter((o: any) => o.outcome_type === 'completed_late').length;
        const rolled_forward = outcomes.filter((o: any) => o.outcome_type === 'rolled_forward').length;
        const dropped = outcomes.filter((o: any) => o.outcome_type === 'dropped').length;
        
        const roll_rate = total > 0 ? Math.round((rolled_forward / total) * 100) : 0;
        const drop_rate = total > 0 ? Math.round((dropped / total) * 100) : 0;
        
        // Calculate flags
        const flags: SeatFlag[] = [];
        
        // High roll rate flag (>=40%)
        if (roll_rate >= 40) {
          flags.push({
            type: 'high_roll_rate',
            message: `Roll rate of ${roll_rate}% exceeds threshold`,
            severity: roll_rate >= 60 ? 'critical' : 'warning',
          });
        }
        
        // Check for repeated drops across quarters
        const seatHistoricalOutcomes = (allOutcomes || []).filter((o: any) => o.seat_id === seatId);
        const dropQuarters = seatHistoricalOutcomes
          .filter((o: any) => o.outcome_type === 'dropped')
          .map((o: any) => formatQuarter(o.quarter_number, o.quarter_year));
        
        if (dropQuarters.length >= 2) {
          flags.push({
            type: 'repeated_drops',
            message: `Dropped rocks in ${dropQuarters.length} quarters`,
            severity: dropQuarters.length >= 3 ? 'critical' : 'warning',
          });
        }
        
        // Chronic late completion
        const lateRate = total > 0 ? (completed_late / total) * 100 : 0;
        if (lateRate >= 50 && completed_late >= 2) {
          flags.push({
            type: 'chronic_late',
            message: `${Math.round(lateRate)}% of rocks completed late`,
            severity: 'warning',
          });
        }
        
        summaries.push({
          seat_id: seatId,
          seat_name: firstOutcome.seat?.seat_name || 'Unassigned',
          owner_name: firstOutcome.owner_id ? userMap[firstOutcome.owner_id] || null : null,
          total_rocks: total,
          completed_on_time,
          completed_late,
          rolled_forward,
          dropped,
          completion_rate: total > 0 ? Math.round(((completed_on_time + completed_late) / total) * 100) : 0,
          roll_rate,
          drop_rate,
          flags,
        });
      });
      
      // Sort by total rocks (highest first)
      summaries.sort((a, b) => b.total_rocks - a.total_rocks);
      
      return summaries;
    },
    enabled: isSuper || !!tenantId,
  });
}

// Hook to get trend data over multiple quarters
export function useRockTrends(numQuarters: number = 6) {
  const { profile, isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin();
  const tenantId = profile?.tenant_id;
  
  return useQuery({
    queryKey: ['rock-trends', tenantId, numQuarters],
    queryFn: async () => {
      let query = supabase
        .from('rock_outcomes')
        .select('outcome_type, quarter_number, quarter_year');
      
      if (!isSuper && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Group by quarter
      const quarterMap = new Map<string, any[]>();
      (data || []).forEach((outcome: any) => {
        const key = `${outcome.quarter_year}-${outcome.quarter_number}`;
        if (!quarterMap.has(key)) {
          quarterMap.set(key, []);
        }
        quarterMap.get(key)!.push(outcome);
      });
      
      // Sort quarters chronologically and take last N
      const sortedKeys = [...quarterMap.keys()].sort((a, b) => {
        const [yearA, qA] = a.split('-').map(Number);
        const [yearB, qB] = b.split('-').map(Number);
        if (yearA !== yearB) return yearA - yearB;
        return qA - qB;
      }).slice(-numQuarters);
      
      const trendData: TrendData = {
        quarters: [],
        completion_rates: [],
        roll_rates: [],
        drop_rates: [],
        on_time_rates: [],
      };
      
      sortedKeys.forEach(key => {
        const outcomes = quarterMap.get(key)!;
        const [year, quarter] = key.split('-').map(Number);
        const total = outcomes.length;
        
        const completed_on_time = outcomes.filter((o: any) => o.outcome_type === 'completed_on_time').length;
        const completed_late = outcomes.filter((o: any) => o.outcome_type === 'completed_late').length;
        const rolled = outcomes.filter((o: any) => o.outcome_type === 'rolled_forward').length;
        const dropped = outcomes.filter((o: any) => o.outcome_type === 'dropped').length;
        
        trendData.quarters.push(formatQuarter(quarter, year));
        trendData.completion_rates.push(total > 0 ? Math.round(((completed_on_time + completed_late) / total) * 100) : 0);
        trendData.on_time_rates.push(total > 0 ? Math.round((completed_on_time / total) * 100) : 0);
        trendData.roll_rates.push(total > 0 ? Math.round((rolled / total) * 100) : 0);
        trendData.drop_rates.push(total > 0 ? Math.round((dropped / total) * 100) : 0);
      });
      
      return trendData;
    },
    enabled: isSuper || !!tenantId,
  });
}

// Hook to generate rock outcomes for a quarter
export function useGenerateRockOutcomes() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async ({ quarterNumber, quarterYear }: { quarterNumber: number; quarterYear: number }) => {
      const { data, error } = await supabase.rpc('generate_rock_outcomes', {
        p_tenant_id: profile?.tenant_id,
        p_quarter_number: quarterNumber,
        p_quarter_year: quarterYear,
      });
      
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['rock-outcomes'] });
      queryClient.invalidateQueries({ queryKey: ['rock-quarterly-summary'] });
      queryClient.invalidateQueries({ queryKey: ['rock-seat-analysis'] });
      queryClient.invalidateQueries({ queryKey: ['rock-trends'] });
      toast.success(`Generated ${count} rock outcome${count !== 1 ? 's' : ''}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate outcomes');
    },
  });
}

// Get list of available quarters that have outcomes
export function useAvailableQuarters() {
  const { profile, isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin();
  const tenantId = profile?.tenant_id;
  
  return useQuery({
    queryKey: ['rock-available-quarters', tenantId],
    queryFn: async () => {
      let query = supabase
        .from('rock_outcomes')
        .select('quarter_number, quarter_year');
      
      if (!isSuper && tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Get unique quarters
      const quarters = new Set<string>();
      (data || []).forEach((o: any) => {
        quarters.add(formatQuarter(o.quarter_number, o.quarter_year));
      });
      
      // Sort descending (newest first)
      return [...quarters].sort((a, b) => {
        const [qA, yA] = [parseInt(a[1]), parseInt(a.slice(3))];
        const [qB, yB] = [parseInt(b[1]), parseInt(b.slice(3))];
        if (yA !== yB) return yB - yA;
        return qB - qA;
      });
    },
    enabled: isSuper || !!tenantId,
  });
}
