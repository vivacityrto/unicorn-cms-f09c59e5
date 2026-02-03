import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type {
  GWCDimension,
  TrendDirection,
  GWCStatus,
  QuarterlyGWCData,
  DimensionTrend,
  SeatGWCTrends,
  GWCAlert,
  TenantGWCSummary,
  GWC_DIMENSION_LABELS,
  GWC_DIMENSION_DESCRIPTIONS,
} from '@/types/gwcTrends';

const TREND_TOLERANCE = 0.1; // 10% tolerance band for stable

/**
 * Calculate trend direction based on yes rates over time
 */
function calculateTrend(rates: number[]): TrendDirection {
  if (rates.length < 2) return 'stable';
  
  const recent = rates.slice(-2);
  const older = rates.slice(0, -1);
  
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
  
  const diff = recentAvg - olderAvg;
  
  if (diff > TREND_TOLERANCE) return 'improving';
  if (diff < -TREND_TOLERANCE) return 'declining';
  return 'stable';
}

/**
 * Determine GWC status based on current rate and trend
 */
function calculateStatus(yesRate: number, trend: TrendDirection, consecutiveNo: number): GWCStatus {
  // Risk if: <50% yes rate, OR 2+ consecutive No, OR declining with low rate
  if (yesRate < 0.5 || consecutiveNo >= 2) return 'risk';
  if (trend === 'declining' && yesRate < 0.7) return 'risk';
  
  // Watch if: <80% yes rate OR declining trend
  if (yesRate < 0.8 || trend === 'declining') return 'watch';
  
  return 'strong';
}

/**
 * Parse quarterly data for a specific dimension
 */
function parseDimensionData(
  data: QuarterlyGWCData[],
  dimension: GWCDimension
): DimensionTrend {
  const yesKey = `${dimension}_yes` as keyof QuarterlyGWCData;
  const noKey = `${dimension}_no` as keyof QuarterlyGWCData;
  const totalKey = `${dimension}_total` as keyof QuarterlyGWCData;
  
  const quarterlyData = data
    .sort((a, b) => {
      if (a.quarter_year !== b.quarter_year) return a.quarter_year - b.quarter_year;
      return a.quarter_number - b.quarter_number;
    })
    .map(q => ({
      quarter: `Q${q.quarter_number} ${q.quarter_year}`,
      yesRate: (q[totalKey] as number) > 0 
        ? (q[yesKey] as number) / (q[totalKey] as number) 
        : 0,
      yesCount: q[yesKey] as number,
      noCount: q[noKey] as number,
      total: q[totalKey] as number,
    }));
  
  const rates = quarterlyData.map(q => q.yesRate);
  const trend = calculateTrend(rates);
  const currentYesRate = rates.length > 0 ? rates[rates.length - 1] : 0;
  const previousYesRate = rates.length > 1 ? rates[rates.length - 2] : null;
  
  // Calculate consecutive "No" (where yes rate is 0)
  let consecutiveNo = 0;
  for (let i = quarterlyData.length - 1; i >= 0; i--) {
    if (quarterlyData[i].yesRate < 0.5) {
      consecutiveNo++;
    } else {
      break;
    }
  }
  
  const status = calculateStatus(currentYesRate, trend, consecutiveNo);
  
  const labels: Record<GWCDimension, string> = {
    gets_it: 'Get It',
    wants_it: 'Want It',
    capacity: 'Capacity',
  };
  
  const descriptions: Record<GWCDimension, string> = {
    gets_it: 'Understands the role and responsibilities',
    wants_it: 'Motivated and engaged with the work',
    capacity: 'Has time and resources to succeed',
  };
  
  return {
    dimension,
    label: labels[dimension],
    description: descriptions[dimension],
    currentYesRate,
    previousYesRate,
    trend,
    status,
    quarterlyData,
    consecutiveNo,
    hasDivergence: false, // Would need manager vs team member data
  };
}

/**
 * Generate alerts for a seat's GWC data
 */
function generateAlerts(
  seatId: string,
  seatName: string,
  dimensions: DimensionTrend[]
): GWCAlert[] {
  const alerts: GWCAlert[] = [];
  
  dimensions.forEach(dim => {
    // Consecutive No alert
    if (dim.consecutiveNo >= 2) {
      alerts.push({
        id: `${seatId}-${dim.dimension}-consecutive`,
        dimension: dim.dimension,
        type: 'consecutive_no',
        severity: dim.consecutiveNo >= 3 ? 'high' : 'medium',
        message: `${dim.label} has been "No" for ${dim.consecutiveNo} consecutive quarters`,
        seatId,
        seatName,
      });
    }
    
    // Declining trend with low rate
    if (dim.trend === 'declining' && dim.currentYesRate < 0.7) {
      alerts.push({
        id: `${seatId}-${dim.dimension}-declining`,
        dimension: dim.dimension,
        type: 'declining_with_load',
        severity: dim.currentYesRate < 0.5 ? 'high' : 'medium',
        message: `${dim.label} is declining (now at ${Math.round(dim.currentYesRate * 100)}%)`,
        seatId,
        seatName,
      });
    }
  });
  
  // All dimensions at risk
  if (dimensions.every(d => d.status === 'risk')) {
    alerts.push({
      id: `${seatId}-all-risk`,
      dimension: 'capacity', // Primary concern
      type: 'all_no',
      severity: 'high',
      message: 'All GWC dimensions are at risk',
      seatId,
      seatName,
    });
  }
  
  return alerts;
}

/**
 * Hook to fetch GWC trends for a specific seat
 */
export function useSeatGWCTrends(seatId: string | null) {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['gwc-seat-trends', seatId, profile?.tenant_id],
    queryFn: async (): Promise<SeatGWCTrends | null> => {
      if (!seatId || !profile?.tenant_id) return null;
      
      // Fetch seat info
      const { data: seatData, error: seatError } = await supabase
        .from('accountability_seats')
        .select(`
          id,
          seat_name,
          accountability_functions!inner(name)
        `)
        .eq('id', seatId)
        .single();
      
      if (seatError || !seatData) return null;
      
      // Fetch primary owner
      const { data: assignment } = await supabase
        .from('accountability_seat_assignments')
        .select('user_id')
        .eq('seat_id', seatId)
        .eq('assignment_type', 'Primary')
        .or('end_date.is.null,end_date.gt.' + new Date().toISOString())
        .maybeSingle();
      
      let ownerName: string | null = null;
      if (assignment?.user_id) {
        const { data: user } = await supabase
          .from('users')
          .select('first_name, last_name')
          .eq('user_uuid', assignment.user_id)
          .single();
        ownerName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : null;
      }
      
      // Fetch GWC trend data from view
      const { data: trendData, error: trendError } = await supabase
        .from('gwc_seat_trends')
        .select('*')
        .eq('seat_id', seatId)
        .eq('tenant_id', profile.tenant_id)
        .order('quarter_year', { ascending: true })
        .order('quarter_number', { ascending: true });
      
      if (trendError) {
        console.error('Error fetching GWC trends:', trendError);
        return null;
      }
      
      const quarterlyData = (trendData || []) as unknown as QuarterlyGWCData[];
      
      // Parse dimensions
      const dimensions: DimensionTrend[] = [
        parseDimensionData(quarterlyData, 'gets_it'),
        parseDimensionData(quarterlyData, 'wants_it'),
        parseDimensionData(quarterlyData, 'capacity'),
      ];
      
      // Overall status (worst of the three)
      const statusPriority: GWCStatus[] = ['risk', 'watch', 'strong'];
      const overallStatus = statusPriority.find(s => dimensions.some(d => d.status === s)) || 'strong';
      
      // Overall trend (most concerning)
      const trendPriority: TrendDirection[] = ['declining', 'stable', 'improving'];
      const overallTrend = trendPriority.find(t => dimensions.some(d => d.trend === t)) || 'stable';
      
      const seatName = seatData.seat_name;
      const alerts = generateAlerts(seatId, seatName, dimensions);
      
      // Get last assessed date
      const lastQuarter = quarterlyData[quarterlyData.length - 1];
      const lastAssessed = lastQuarter 
        ? `Q${lastQuarter.quarter_number} ${lastQuarter.quarter_year}` 
        : null;
      
      return {
        seatId,
        seatName,
        functionName: (seatData.accountability_functions as any)?.name || '',
        ownerName,
        dimensions,
        overallStatus,
        overallTrend,
        lastAssessed,
        totalQuarters: quarterlyData.length,
        alerts,
      };
    },
    enabled: !!seatId && !!profile?.tenant_id,
  });
}

/**
 * Hook to fetch GWC trends for all seats in a tenant
 */
export function useTenantGWCTrends() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['gwc-tenant-trends', profile?.tenant_id],
    queryFn: async (): Promise<TenantGWCSummary | null> => {
      if (!profile?.tenant_id) return null;
      
      // Get all seats
      const { data: seats, error: seatsError } = await supabase
        .from('accountability_seats')
        .select('id, seat_name')
        .eq('tenant_id', profile.tenant_id);
      
      if (seatsError || !seats) return null;
      
      // Get all GWC trend data
      const { data: trendData, error: trendError } = await supabase
        .from('gwc_seat_trends')
        .select('*')
        .eq('tenant_id', profile.tenant_id);
      
      if (trendError) return null;
      
      const allData = (trendData || []) as unknown as (QuarterlyGWCData & { seat_id: string })[];
      
      // Group by seat
      const seatDataMap = new Map<string, QuarterlyGWCData[]>();
      allData.forEach(d => {
        const existing = seatDataMap.get(d.seat_id) || [];
        existing.push(d);
        seatDataMap.set(d.seat_id, existing);
      });
      
      // Calculate per-seat status
      let strongCount = 0;
      let watchCount = 0;
      let riskCount = 0;
      const allAlerts: GWCAlert[] = [];
      const dimensionRates: Record<GWCDimension, number[]> = {
        gets_it: [],
        wants_it: [],
        capacity: [],
      };
      
      seats.forEach(seat => {
        const seatTrends = seatDataMap.get(seat.id);
        if (!seatTrends || seatTrends.length === 0) return;
        
        const dimensions = [
          parseDimensionData(seatTrends, 'gets_it'),
          parseDimensionData(seatTrends, 'wants_it'),
          parseDimensionData(seatTrends, 'capacity'),
        ];
        
        // Track dimension rates
        dimensions.forEach(d => {
          if (d.currentYesRate > 0) {
            dimensionRates[d.dimension].push(d.currentYesRate);
          }
        });
        
        // Determine seat status
        const statusPriority: GWCStatus[] = ['risk', 'watch', 'strong'];
        const seatStatus = statusPriority.find(s => dimensions.some(d => d.status === s)) || 'strong';
        
        if (seatStatus === 'strong') strongCount++;
        else if (seatStatus === 'watch') watchCount++;
        else riskCount++;
        
        // Collect alerts
        const seatAlerts = generateAlerts(seat.id, seat.seat_name, dimensions);
        allAlerts.push(...seatAlerts);
      });
      
      // Calculate dimension summaries
      const dimensionSummary = (['gets_it', 'wants_it', 'capacity'] as GWCDimension[]).map(dim => {
        const rates = dimensionRates[dim];
        const avgRate = rates.length > 0 
          ? rates.reduce((a, b) => a + b, 0) / rates.length 
          : 0;
        
        return {
          dimension: dim,
          avgYesRate: avgRate,
          trend: 'stable' as TrendDirection, // Would need historical data
          riskCount: allAlerts.filter(a => a.dimension === dim && a.severity === 'high').length,
        };
      });
      
      // Sort alerts by severity
      const topAlerts = allAlerts
        .sort((a, b) => {
          const severityOrder = { high: 0, medium: 1, low: 2 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        })
        .slice(0, 5);
      
      return {
        totalSeats: seats.length,
        seatsWithData: seatDataMap.size,
        strongCount,
        watchCount,
        riskCount,
        dimensionSummary,
        topAlerts,
      };
    },
    enabled: !!profile?.tenant_id,
  });
}

/**
 * Hook to fetch all seat GWC trends for display
 */
export function useAllSeatGWCTrends() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['gwc-all-seat-trends', profile?.tenant_id],
    queryFn: async (): Promise<SeatGWCTrends[]> => {
      if (!profile?.tenant_id) return [];
      
      // Get all seats with function info
      const { data: seats, error: seatsError } = await supabase
        .from('accountability_seats')
        .select(`
          id,
          seat_name,
          accountability_functions!inner(name)
        `)
        .eq('tenant_id', profile.tenant_id);
      
      if (seatsError || !seats) return [];
      
      // Get all assignments
      const { data: assignments } = await supabase
        .from('accountability_seat_assignments')
        .select('seat_id, user_id')
        .eq('tenant_id', profile.tenant_id)
        .eq('assignment_type', 'Primary')
        .or('end_date.is.null,end_date.gt.' + new Date().toISOString());
      
      const assignmentMap = new Map(assignments?.map(a => [a.seat_id, a.user_id]) || []);
      
      // Get user names
      const userIds = [...new Set(assignments?.map(a => a.user_id) || [])];
      const { data: users } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .in('user_uuid', userIds);
      
      const userMap = new Map(users?.map(u => [
        u.user_uuid, 
        `${u.first_name || ''} ${u.last_name || ''}`.trim()
      ]) || []);
      
      // Get all GWC trend data
      const { data: trendData, error: trendError } = await supabase
        .from('gwc_seat_trends')
        .select('*')
        .eq('tenant_id', profile.tenant_id);
      
      if (trendError) return [];
      
      const allData = (trendData || []) as unknown as (QuarterlyGWCData & { seat_id: string })[];
      
      // Group by seat
      const seatDataMap = new Map<string, QuarterlyGWCData[]>();
      allData.forEach(d => {
        const existing = seatDataMap.get(d.seat_id) || [];
        existing.push(d);
        seatDataMap.set(d.seat_id, existing);
      });
      
      // Build trends for each seat
      return seats.map(seat => {
        const quarterlyData = seatDataMap.get(seat.id) || [];
        const ownerId = assignmentMap.get(seat.id);
        const ownerName = ownerId ? userMap.get(ownerId) || null : null;
        
        const dimensions: DimensionTrend[] = [
          parseDimensionData(quarterlyData, 'gets_it'),
          parseDimensionData(quarterlyData, 'wants_it'),
          parseDimensionData(quarterlyData, 'capacity'),
        ];
        
        const statusPriority: GWCStatus[] = ['risk', 'watch', 'strong'];
        const overallStatus = statusPriority.find(s => dimensions.some(d => d.status === s)) || 'strong';
        
        const trendPriority: TrendDirection[] = ['declining', 'stable', 'improving'];
        const overallTrend = trendPriority.find(t => dimensions.some(d => d.trend === t)) || 'stable';
        
        const lastQuarter = quarterlyData.sort((a, b) => {
          if (a.quarter_year !== b.quarter_year) return b.quarter_year - a.quarter_year;
          return b.quarter_number - a.quarter_number;
        })[0];
        
        const alerts = generateAlerts(seat.id, seat.seat_name, dimensions);
        
        return {
          seatId: seat.id,
          seatName: seat.seat_name,
          functionName: (seat.accountability_functions as any)?.name || '',
          ownerName,
          dimensions,
          overallStatus,
          overallTrend,
          lastAssessed: lastQuarter ? `Q${lastQuarter.quarter_number} ${lastQuarter.quarter_year}` : null,
          totalQuarters: quarterlyData.length,
          alerts,
        };
      }).sort((a, b) => {
        // Sort by status (risk first) then by name
        const statusOrder = { risk: 0, watch: 1, strong: 2 };
        if (statusOrder[a.overallStatus] !== statusOrder[b.overallStatus]) {
          return statusOrder[a.overallStatus] - statusOrder[b.overallStatus];
        }
        return a.seatName.localeCompare(b.seatName);
      });
    },
    enabled: !!profile?.tenant_id,
  });
}
