import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import type { FlightPlan, MonthFocus } from '@/types/flightPlan';
import { getQuarterDueDate } from '@/types/flightPlan';

const defaultMonthFocus: MonthFocus = { items: [], indicators: [], notes: '' };

export function useFlightPlan(quarter: number, year: number) {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = isSuperAdmin();
  
  // Check if user is Vivacity Team member (Super Admin, Team Leader, Team Member)
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );

  const { data: flightPlan, isLoading } = useQuery({
    queryKey: ['flight-plan', isSuper || isVivacityTeam ? 'vivacity_team' : profile?.tenant_id, quarter, year],
    queryFn: async () => {
      let query = supabase
        .from('eos_flight_plans')
        .select('*')
        .eq('quarter_number', quarter)
        .eq('quarter_year', year);
      
      // Vivacity Team sees all; client users filter by tenant
      if (!isSuper && !isVivacityTeam && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }
      
      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      
      if (!data) return null;
      
      // Transform the data to match our type
      return {
        ...data,
        success_indicators: Array.isArray(data.success_indicators) ? data.success_indicators : [],
        stop_doing: Array.isArray(data.stop_doing) ? data.stop_doing : [],
        measurables: Array.isArray(data.measurables) ? data.measurables : [],
        month_1_focus: data.month_1_focus || defaultMonthFocus,
        month_2_focus: data.month_2_focus || defaultMonthFocus,
        month_3_focus: data.month_3_focus || defaultMonthFocus,
      } as FlightPlan;
    },
    enabled: (isSuper || isVivacityTeam || !!profile?.tenant_id) && !!quarter && !!year,
  });

  const upsertFlightPlan = useMutation({
    mutationFn: async (updates: Partial<FlightPlan>) => {
      const dueDate = getQuarterDueDate(quarter, year);
      
      const payload = {
        tenant_id: profile?.tenant_id!,
        quarter_number: quarter,
        quarter_year: year,
        due_date: dueDate,
        ...updates,
        updated_by: profile?.user_uuid,
      };

      // If no existing plan, add created_by
      if (!flightPlan) {
        (payload as any).created_by = profile?.user_uuid;
      } else {
        (payload as any).id = flightPlan.id;
      }

      const { data, error } = await supabase
        .from('eos_flight_plans')
        .upsert(payload as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flight-plan'] });
      toast({ title: 'Flight Plan saved successfully' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error saving Flight Plan', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  return {
    flightPlan,
    isLoading,
    upsertFlightPlan,
  };
}

export function useQuarterlyRocks(quarter: number, year: number) {
  const { profile, isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin();
  
  // Check if user is Vivacity Team member
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );

  return useQuery({
    queryKey: ['quarterly-rocks', isSuper || isVivacityTeam ? 'vivacity_team' : profile?.tenant_id, quarter, year],
    queryFn: async () => {
      let query = supabase
        .from('eos_rocks')
        .select('*')
        .eq('quarter_number', quarter)
        .eq('quarter_year', year)
        .order('priority', { ascending: true });
      
      // Vivacity Team sees all; client users filter by tenant
      if (!isSuper && !isVivacityTeam && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }
      
      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
    enabled: (isSuper || isVivacityTeam || !!profile?.tenant_id) && !!quarter && !!year,
  });
}