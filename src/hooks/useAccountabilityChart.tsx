import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useRBAC } from './useRBAC';
import { toast } from '@/hooks/use-toast';
import { VIVACITY_TENANT_ID } from './useVivacityTeamUsers';
import type {
  AccountabilityChart,
  ChartVersion,
  AccountabilityFunction,
  AccountabilitySeat,
  SeatRole,
  SeatAssignment,
  ChartWithDetails,
  FunctionWithSeats,
  SeatWithDetails,
  CreateFunctionInput,
  CreateSeatInput,
  CreateRoleInput,
  CreateAssignmentInput,
  SaveVersionInput,
  ChartStatus,
  ChartSnapshot,
  SeatLinkedData,
  UpdateSeatInput,
} from '@/types/accountabilityChart';

/**
 * Hook to manage the EOS Accountability Chart.
 * 
 * EOS is Vivacity-internal only:
 * - Only Vivacity Team users can access (Super Admin, Team Leader, Team Member)
 * - All data belongs to the Vivacity system tenant (ID: 6372)
 * - Clients cannot view or edit any EOS data
 * 
 * Access:
 * - View: Super Admin, Team Leader (read-only)
 * - Edit: Super Admin only
 */
export function useAccountabilityChart() {
  const { profile, isSuperAdmin } = useAuth();
  const { isVivacityTeam, canAccessEOS } = useRBAC();
  const queryClient = useQueryClient();
  
  // EOS always uses the Vivacity system tenant, not the user's tenant
  const tenantId = VIVACITY_TENANT_ID;
  const userId = profile?.user_uuid;
  const isSuper = isSuperAdmin();
  
  // Only Vivacity Team can view, only SuperAdmin can edit
  const canView = canAccessEOS();
  const canEdit = isSuper;

  // Fetch the chart with all related data
  const { data: chart, isLoading, refetch } = useQuery({
    queryKey: ['accountability-chart', tenantId],
    queryFn: async (): Promise<ChartWithDetails | null> => {
      if (!tenantId || !canView) return null;

      // Get or create chart
      let { data: chartData, error } = await supabase
        .from('accountability_charts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // If no chart exists, return null (will be created on first action)
      if (!chartData) return null;

      // Fetch all related data in parallel
      const [functionsRes, seatsRes, rolesRes, assignmentsRes, versionsRes, usersRes, linkedDataRes] = await Promise.all([
        supabase
          .from('accountability_functions')
          .select('*')
          .eq('chart_id', chartData.id)
          .order('sort_order'),
        supabase
          .from('accountability_seats')
          .select('*')
          .eq('chart_id', chartData.id)
          .order('sort_order'),
        supabase
          .from('accountability_seat_roles')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('sort_order'),
        supabase
          .from('accountability_seat_assignments')
          .select('*')
          .eq('tenant_id', tenantId)
          .is('end_date', null),
        supabase
          .from('accountability_chart_versions')
          .select('*')
          .eq('chart_id', chartData.id)
          .order('version_number', { ascending: false }),
        supabase
          .from('users')
          .select('user_uuid, first_name, last_name, email, avatar_url')
          .eq('tenant_id', tenantId),
        // Fetch linked data from the view
        supabase
          .from('seat_linked_data')
          .select('*')
          .eq('tenant_id', tenantId),
      ]);

      const functions = (functionsRes.data || []) as AccountabilityFunction[];
      const seats = (seatsRes.data || []) as AccountabilitySeat[];
      const roles = (rolesRes.data || []) as SeatRole[];
      const assignments = (assignmentsRes.data || []) as SeatAssignment[];
      const versions = (versionsRes.data || []).map(v => ({
        ...v,
        snapshot: v.snapshot as unknown as ChartSnapshot,
      })) as ChartVersion[];
      const users = usersRes.data || [];
      const linkedData = (linkedDataRes.data || []) as SeatLinkedData[];

      // Build user map and linked data map
      const userMap = new Map(users.map(u => [u.user_uuid, u]));
      const linkedDataMap = new Map(linkedData.map(ld => [ld.seat_id, ld]));

      // Build seats with details
      const seatsWithDetails: SeatWithDetails[] = seats.map(seat => {
        const seatRoles = roles.filter(r => r.seat_id === seat.id);
        const seatAssignments = assignments
          .filter(a => a.seat_id === seat.id)
          .map(a => ({ ...a, user: userMap.get(a.user_id) }));
        const primaryOwner = seatAssignments.find(a => a.assignment_type === 'Primary')?.user;
        
        return {
          ...seat,
          roles: seatRoles,
          assignments: seatAssignments,
          primaryOwner,
          linkedData: linkedDataMap.get(seat.id),
        };
      });

      // Build functions with seats
      const functionsWithSeats: FunctionWithSeats[] = functions.map(func => ({
        ...func,
        seats: seatsWithDetails.filter(s => s.function_id === func.id),
      }));

      return {
        ...chartData,
        functions: functionsWithSeats,
        versions,
      } as ChartWithDetails;
    },
    enabled: !!tenantId,
  });

  // Create initial chart
  const createChart = useMutation({
    mutationFn: async () => {
      if (!tenantId || !userId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('accountability_charts')
        .insert({
          tenant_id: tenantId,
          status: 'Draft',
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
      toast({ title: 'Accountability Chart created' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating chart', description: error.message, variant: 'destructive' });
    },
  });

  // Add function
  const addFunction = useMutation({
    mutationFn: async (input: CreateFunctionInput) => {
      if (!tenantId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('accountability_functions')
        .insert({
          ...input,
          tenant_id: tenantId,
          sort_order: input.sort_order ?? (chart?.functions.length ?? 0),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
      toast({ title: 'Function added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding function', description: error.message, variant: 'destructive' });
    },
  });

  // Update function
  const updateFunction = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await supabase
        .from('accountability_functions')
        .update({ name })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating function', description: error.message, variant: 'destructive' });
    },
  });

  // Delete function
  const deleteFunction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('accountability_functions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
      toast({ title: 'Function deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting function', description: error.message, variant: 'destructive' });
    },
  });

  // Add seat
  const addSeat = useMutation({
    mutationFn: async (input: CreateSeatInput) => {
      if (!tenantId) throw new Error('Not authenticated');

      const func = chart?.functions.find(f => f.id === input.function_id);
      
      const { data, error } = await supabase
        .from('accountability_seats')
        .insert({
          ...input,
          tenant_id: tenantId,
          sort_order: input.sort_order ?? (func?.seats.length ?? 0),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
      toast({ title: 'Seat added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding seat', description: error.message, variant: 'destructive' });
    },
  });

  // Update seat (supports all fields)
  const updateSeat = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & UpdateSeatInput) => {
      const { data, error } = await supabase
        .from('accountability_seats')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating seat', description: error.message, variant: 'destructive' });
    },
  });

  // Delete seat
  const deleteSeat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('accountability_seats')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
      toast({ title: 'Seat deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting seat', description: error.message, variant: 'destructive' });
    },
  });

  // Add role
  const addRole = useMutation({
    mutationFn: async (input: CreateRoleInput) => {
      if (!tenantId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('accountability_seat_roles')
        .insert({
          ...input,
          tenant_id: tenantId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding accountability', description: error.message, variant: 'destructive' });
    },
  });

  // Update role
  const updateRole = useMutation({
    mutationFn: async ({ id, role_text }: { id: string; role_text: string }) => {
      const { data, error } = await supabase
        .from('accountability_seat_roles')
        .update({ role_text })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating accountability', description: error.message, variant: 'destructive' });
    },
  });

  // Delete role
  const deleteRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('accountability_seat_roles')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting accountability', description: error.message, variant: 'destructive' });
    },
  });

  // Add assignment
  const addAssignment = useMutation({
    mutationFn: async (input: CreateAssignmentInput) => {
      if (!tenantId) throw new Error('Not authenticated');

      // If adding primary, remove any existing primary
      if (input.assignment_type === 'Primary') {
        await supabase
          .from('accountability_seat_assignments')
          .update({ end_date: new Date().toISOString().split('T')[0] })
          .eq('seat_id', input.seat_id)
          .eq('assignment_type', 'Primary')
          .is('end_date', null);
      }

      const { data, error } = await supabase
        .from('accountability_seat_assignments')
        .insert({
          ...input,
          tenant_id: tenantId,
          start_date: input.start_date ?? new Date().toISOString().split('T')[0],
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
      toast({ title: 'Assignment added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding assignment', description: error.message, variant: 'destructive' });
    },
  });

  // Remove assignment
  const removeAssignment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('accountability_seat_assignments')
        .update({ end_date: new Date().toISOString().split('T')[0] })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
      toast({ title: 'Assignment removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error removing assignment', description: error.message, variant: 'destructive' });
    },
  });

  // Save version
  const saveVersion = useMutation({
    mutationFn: async (input: SaveVersionInput) => {
      if (!tenantId || !userId || !chart) throw new Error('Not authenticated or no chart');

      // Build snapshot
      const snapshot: ChartSnapshot = {
        functions: chart.functions.map(f => ({
          id: f.id,
          chart_id: f.chart_id,
          tenant_id: f.tenant_id,
          name: f.name,
          sort_order: f.sort_order,
          created_at: f.created_at,
          updated_at: f.updated_at,
        })),
        seats: chart.functions.flatMap(f => f.seats.map(s => ({
          id: s.id,
          function_id: s.function_id,
          chart_id: s.chart_id,
          tenant_id: s.tenant_id,
          seat_name: s.seat_name,
          sort_order: s.sort_order,
          created_at: s.created_at,
          updated_at: s.updated_at,
        }))),
        roles: chart.functions.flatMap(f => f.seats.flatMap(s => s.roles)),
        assignments: chart.functions.flatMap(f => f.seats.flatMap(s => 
          s.assignments.map(a => ({
            id: a.id,
            seat_id: a.seat_id,
            tenant_id: a.tenant_id,
            user_id: a.user_id,
            assignment_type: a.assignment_type,
            start_date: a.start_date,
            end_date: a.end_date,
            created_at: a.created_at,
            updated_at: a.updated_at,
          }))
        )),
      };

      const nextVersion = (chart.versions?.[0]?.version_number ?? 0) + 1;

      const { data, error } = await supabase
        .from('accountability_chart_versions')
        .insert([{
          chart_id: input.chart_id,
          tenant_id: tenantId,
          version_number: nextVersion,
          change_summary: input.change_summary,
          snapshot: JSON.parse(JSON.stringify(snapshot)),
          created_by: userId,
        }])
        .select()
        .single();

      if (error) throw error;

      // Update current version on chart
      await supabase
        .from('accountability_charts')
        .update({ current_version_id: data.id })
        .eq('id', input.chart_id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
      toast({ title: 'Version saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving version', description: error.message, variant: 'destructive' });
    },
  });

  // Update chart status
  const updateStatus = useMutation({
    mutationFn: async ({ chartId, status }: { chartId: string; status: ChartStatus }) => {
      const { data, error } = await supabase
        .from('accountability_charts')
        .update({ status })
        .eq('id', chartId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['accountability-chart'] });
      toast({ title: `Chart ${data.status === 'Active' ? 'activated' : 'status updated'}` });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating status', description: error.message, variant: 'destructive' });
    },
  });

  return {
    chart,
    isLoading,
    refetch,
    canEdit,
    canView,
    createChart,
    addFunction,
    updateFunction,
    deleteFunction,
    addSeat,
    updateSeat,
    deleteSeat,
    addRole,
    updateRole,
    deleteRole,
    addAssignment,
    removeAssignment,
    saveVersion,
    updateStatus,
  };
}

/**
 * Hook to get seat data for a specific user (for QC integration).
 */
export function useUserSeats(userId?: string) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  return useQuery({
    queryKey: ['user-seats', userId, tenantId],
    queryFn: async () => {
      if (!userId || !tenantId) return [];

      const { data: assignments, error: assignError } = await supabase
        .from('accountability_seat_assignments')
        .select('*, seat:accountability_seats(*)')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .is('end_date', null);

      if (assignError) throw assignError;

      // Get roles for each seat
      const seatIds = assignments?.map(a => a.seat?.id).filter(Boolean) || [];
      
      if (seatIds.length === 0) return [];

      const { data: roles, error: rolesError } = await supabase
        .from('accountability_seat_roles')
        .select('*')
        .in('seat_id', seatIds)
        .order('sort_order');

      if (rolesError) throw rolesError;

      return assignments?.map(a => ({
        ...a,
        seat: {
          ...a.seat,
          roles: roles?.filter(r => r.seat_id === a.seat?.id) || [],
        },
      })) || [];
    },
    enabled: !!userId && !!tenantId,
  });
}
