import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import type {
  PeopleAnalyzerEntry,
  PeopleAnalyzerTrend,
  CoreValueTrendSummary,
  PersonTrendSummary,
  SeatTrendSummary,
  TenantTrendSummary,
  PARating,
  PATrend,
} from '@/types/peopleAnalyzer';

// Vivacity tenant for internal EOS
const VIVACITY_TENANT_ID = 1;

/**
 * Hook for People Analyzer Core Values Trend Reporting
 */
export function usePeopleAnalyzer() {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isStaff = isSuperAdmin() || profile?.unicorn_role === 'Team Leader' || profile?.unicorn_role === 'Team Member';

  // Fetch entries for a user
  const useUserEntries = (userId: string | undefined) => {
    return useQuery({
      queryKey: ['people-analyzer-entries', userId],
      queryFn: async () => {
        if (!userId) return [];
        const { data, error } = await supabase
          .from('people_analyzer_entries')
          .select('*')
          .eq('user_id', userId)
          .order('quarter_year', { ascending: false })
          .order('quarter_number', { ascending: false });
        
        if (error) throw error;
        return data as unknown as PeopleAnalyzerEntry[];
      },
      enabled: !!userId,
    });
  };

  // Fetch trends for a user
  const useUserTrends = (userId: string | undefined) => {
    return useQuery({
      queryKey: ['people-analyzer-trends', userId],
      queryFn: async () => {
        if (!userId) return [];
        const { data, error } = await supabase
          .from('people_analyzer_trends')
          .select('*')
          .eq('user_id', userId)
          .order('quarter_year', { ascending: false })
          .order('quarter_number', { ascending: false });
        
        if (error) throw error;
        return data as unknown as PeopleAnalyzerTrend[];
      },
      enabled: !!userId,
    });
  };

  // Fetch trends for a seat
  const useSeatTrends = (seatId: string | undefined) => {
    return useQuery({
      queryKey: ['people-analyzer-seat-trends', seatId],
      queryFn: async () => {
        if (!seatId) return [];
        const { data, error } = await supabase
          .from('people_analyzer_trends')
          .select('*')
          .eq('seat_id', seatId)
          .order('quarter_year', { ascending: false })
          .order('quarter_number', { ascending: false });
        
        if (error) throw error;
        return data as unknown as PeopleAnalyzerTrend[];
      },
      enabled: !!seatId,
    });
  };

  // Fetch all at-risk trends (for alerts)
  const { data: atRiskTrends, isLoading: atRiskLoading } = useQuery({
    queryKey: ['people-analyzer-at-risk', VIVACITY_TENANT_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('people_analyzer_trends')
        .select('*')
        .eq('tenant_id', VIVACITY_TENANT_ID)
        .eq('is_at_risk', true);
      
      if (error) throw error;
      return data as unknown as PeopleAnalyzerTrend[];
    },
    enabled: isStaff,
  });

  // Calculate trends from entries
  const calculateTrends = useMutation({
    mutationFn: async (userId: string) => {
      // Fetch entries for last 6 quarters
      const now = new Date();
      const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
      const currentYear = now.getFullYear();

      const { data: entries, error: entriesError } = await supabase
        .from('people_analyzer_entries')
        .select('*')
        .eq('user_id', userId)
        .order('quarter_year', { ascending: true })
        .order('quarter_number', { ascending: true });

      if (entriesError) throw entriesError;
      if (!entries?.length) return [];

      // Group by core value
      const byValue: Record<string, PeopleAnalyzerEntry[]> = {};
      for (const entry of entries) {
        const key = entry.core_value_id;
        if (!byValue[key]) byValue[key] = [];
        byValue[key].push(entry as unknown as PeopleAnalyzerEntry);
      }

      const results: PeopleAnalyzerTrend[] = [];

      for (const [coreValueId, valueEntries] of Object.entries(byValue)) {
        // Group by quarter
        const byQuarter: Record<string, PeopleAnalyzerEntry[]> = {};
        for (const e of valueEntries) {
          const qKey = `${e.quarter_year}-Q${e.quarter_number}`;
          if (!byQuarter[qKey]) byQuarter[qKey] = [];
          byQuarter[qKey].push(e);
        }

        const quarters = Object.keys(byQuarter).sort().slice(-6);
        
        // Calculate current quarter stats
        const currentKey = `${currentYear}-Q${currentQuarter}`;
        const currentEntries = byQuarter[currentKey] || [];
        
        const managerEntry = currentEntries.find(e => e.assessed_by === 'Manager');
        const teamEntry = currentEntries.find(e => e.assessed_by === 'TeamMember');
        
        // Calculate rates across all quarters
        let totalPlus = 0, totalPlusMinus = 0, totalMinus = 0, total = 0;
        for (const e of valueEntries) {
          total++;
          if (e.rating === 'Plus') totalPlus++;
          else if (e.rating === 'PlusMinus') totalPlusMinus++;
          else totalMinus++;
        }

        const plusRate = total > 0 ? totalPlus / total : 0;
        const plusMinusRate = total > 0 ? totalPlusMinus / total : 0;
        const minusRate = total > 0 ? totalMinus / total : 0;

        // Calculate trend (compare first half to second half of quarters)
        const trend = calculateTrendDirection(quarters.map(q => byQuarter[q] || []));

        // Check for divergence
        const hasDivergence = managerEntry && teamEntry && managerEntry.rating !== teamEntry.rating;

        // Check consecutive minus
        let consecutiveMinus = 0;
        for (let i = quarters.length - 1; i >= 0; i--) {
          const qEntries = byQuarter[quarters[i]] || [];
          const hasAnyMinus = qEntries.some(e => e.rating === 'Minus');
          if (hasAnyMinus) consecutiveMinus++;
          else break;
        }

        const isAtRisk = consecutiveMinus >= 2 || (trend === 'Declining' && minusRate > 0.3);

        // Get seat from most recent entry
        const latestEntry = valueEntries[valueEntries.length - 1];

        // Build the record with all required fields
        const trendRecord = {
          tenant_id: VIVACITY_TENANT_ID,
          user_id: userId,
          seat_id: latestEntry.seat_id,
          core_value_id: coreValueId,
          core_value_text: latestEntry.core_value_text,
          period_start: `${currentYear}-${String((currentQuarter - 1) * 3 + 1).padStart(2, '0')}-01`,
          period_end: `${currentYear}-${String(currentQuarter * 3).padStart(2, '0')}-28`,
          quarter_year: currentYear,
          quarter_number: currentQuarter,
          plus_rate: plusRate,
          plus_minus_rate: plusMinusRate,
          minus_rate: minusRate,
          trend,
          manager_rating: managerEntry?.rating || null,
          team_member_rating: teamEntry?.rating || null,
          has_divergence: hasDivergence || false,
          consecutive_minus_count: consecutiveMinus,
          is_at_risk: isAtRisk,
          calculated_at: new Date().toISOString(),
        };

        // Upsert trend
        const { data: upserted, error } = await supabase
          .from('people_analyzer_trends')
          .upsert([trendRecord as any], {
            onConflict: 'user_id,core_value_id,quarter_year,quarter_number',
          })
          .select()
          .single();

        if (error) throw error;
        results.push(upserted as unknown as PeopleAnalyzerTrend);

        // Audit log
        await supabase.from('audit_people_analyzer').insert({
          tenant_id: VIVACITY_TENANT_ID,
          user_id: profile?.user_uuid,
          event_type: 'trend_calculated',
          details: { 
            target_user_id: userId,
            core_value_id: coreValueId,
            trend,
            is_at_risk: isAtRisk,
          },
        });
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people-analyzer-trends'] });
      toast({ title: 'Trends calculated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error calculating trends', description: error.message, variant: 'destructive' });
    },
  });

  // Add entry from QC
  const addEntry = useMutation({
    mutationFn: async (entry: Omit<PeopleAnalyzerEntry, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('people_analyzer_entries')
        .insert([{
          ...entry,
          tenant_id: VIVACITY_TENANT_ID,
          created_by: profile?.user_uuid,
        }])
        .select()
        .single();

      if (error) throw error;

      // Audit
      await supabase.from('audit_people_analyzer').insert({
        tenant_id: VIVACITY_TENANT_ID,
        user_id: profile?.user_uuid,
        entry_id: data.id,
        event_type: 'entry_created',
        details: { rating: entry.rating, core_value: entry.core_value_text },
      });

      return data as unknown as PeopleAnalyzerEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people-analyzer-entries'] });
    },
  });

  // Build person trend summary
  function buildPersonSummary(
    userId: string,
    userName: string,
    trends: PeopleAnalyzerTrend[],
    seatId?: string | null,
    seatName?: string | null
  ): PersonTrendSummary {
    const coreValues: CoreValueTrendSummary[] = [];
    
    // Group trends by core value
    const byValue: Record<string, PeopleAnalyzerTrend[]> = {};
    for (const t of trends) {
      if (!byValue[t.core_value_id]) byValue[t.core_value_id] = [];
      byValue[t.core_value_id].push(t);
    }

    for (const [valueId, valueTrends] of Object.entries(byValue)) {
      const sorted = [...valueTrends].sort((a, b) => 
        (b.quarter_year * 10 + b.quarter_number) - (a.quarter_year * 10 + a.quarter_number)
      );
      const latest = sorted[0];

      coreValues.push({
        core_value_id: valueId,
        core_value_text: latest.core_value_text,
        currentRating: (latest.manager_rating || latest.team_member_rating) as PARating | null,
        trend: latest.trend as PATrend,
        quarters: sorted.slice(0, 6).map(t => ({
          year: t.quarter_year,
          quarter: t.quarter_number,
          rating: (t.manager_rating || t.team_member_rating) as PARating | null,
          managerRating: t.manager_rating as PARating | null,
          teamMemberRating: t.team_member_rating as PARating | null,
        })),
        consecutiveMinusCount: latest.consecutive_minus_count,
        hasDivergence: latest.has_divergence,
        isAtRisk: latest.is_at_risk,
      });
    }

    const atRiskCount = coreValues.filter(v => v.isAtRisk).length;
    const decliningCount = coreValues.filter(v => v.trend === 'Declining').length;
    
    let overallHealth: 'Healthy' | 'AtRisk' | 'Declining' = 'Healthy';
    if (decliningCount >= 2 || atRiskCount >= 2) overallHealth = 'Declining';
    else if (atRiskCount > 0 || decliningCount > 0) overallHealth = 'AtRisk';

    return {
      userId,
      userName,
      seatId: seatId || null,
      seatName: seatName || null,
      coreValues,
      overallHealth,
      atRiskCount,
    };
  }

  return {
    useUserEntries,
    useUserTrends,
    useSeatTrends,
    atRiskTrends,
    atRiskLoading,
    calculateTrends,
    addEntry,
    buildPersonSummary,
    isStaff,
  };
}

// Helper to determine trend direction
function calculateTrendDirection(quarterEntries: PeopleAnalyzerEntry[][]): PATrend {
  if (quarterEntries.length < 2) return 'Stable';

  // Compare first half to second half
  const midpoint = Math.floor(quarterEntries.length / 2);
  const firstHalf = quarterEntries.slice(0, midpoint).flat();
  const secondHalf = quarterEntries.slice(midpoint).flat();

  const firstMinusRate = firstHalf.length > 0 
    ? firstHalf.filter(e => e.rating === 'Minus').length / firstHalf.length 
    : 0;
  const secondMinusRate = secondHalf.length > 0 
    ? secondHalf.filter(e => e.rating === 'Minus').length / secondHalf.length 
    : 0;

  const firstPlusRate = firstHalf.length > 0 
    ? firstHalf.filter(e => e.rating === 'Plus').length / firstHalf.length 
    : 0;
  const secondPlusRate = secondHalf.length > 0 
    ? secondHalf.filter(e => e.rating === 'Plus').length / secondHalf.length 
    : 0;

  // Tolerance: 10% difference
  const tolerance = 0.1;

  if (secondPlusRate - firstPlusRate > tolerance && secondMinusRate < firstMinusRate) {
    return 'Improving';
  }
  if (secondMinusRate - firstMinusRate > tolerance) {
    return 'Declining';
  }
  return 'Stable';
}
