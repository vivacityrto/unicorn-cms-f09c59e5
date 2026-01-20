import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type AttendanceStatus = 'invited' | 'accepted' | 'declined' | 'attended' | 'late' | 'left_early' | 'no_show';
export type MeetingRole = 'owner' | 'attendee' | 'guest' | 'visionary' | 'integrator' | 'core_team';

export interface MeetingAttendee {
  id: string;
  meeting_id: string;
  user_id: string;
  role_in_meeting: MeetingRole;
  attendance_status: AttendanceStatus;
  joined_at: string | null;
  left_at: string | null;
  notes: string | null;
  marked_by: string | null;
  created_at: string;
  updated_at: string;
  users?: {
    first_name: string | null;
    last_name: string | null;
    email?: string;
  };
}

export interface QuorumStatus {
  quorum_required: number;
  quorum_present: number;
  quorum_met: boolean;
  owner_present: boolean;
  visionary_present: boolean;
  integrator_present: boolean;
  core_team_present: number;
  core_team_required: number;
  issues: string[];
}

export interface StartMeetingResult {
  success: boolean;
  error?: string;
  quorum?: QuorumStatus;
  requires_override?: boolean;
  blocked?: boolean;
  quorum_met?: boolean;
}

export const useMeetingAttendance = (meetingId: string | undefined) => {
  const queryClient = useQueryClient();

  // Fetch attendees for the meeting
  const { data: attendees, isLoading: attendeesLoading } = useQuery({
    queryKey: ['meeting-attendees', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_meeting_attendees')
        .select(`
          *,
          users!eos_meeting_attendees_user_id_fkey (first_name, last_name)
        `)
        .eq('meeting_id', meetingId!);
      
      if (error) throw error;
      return (data || []) as unknown as MeetingAttendee[];
    },
    enabled: !!meetingId,
  });

  // Calculate quorum status
  const { data: quorumStatus, isLoading: quorumLoading } = useQuery({
    queryKey: ['meeting-quorum', meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('calculate_quorum', { p_meeting_id: meetingId! });
      
      if (error) throw error;
      return data?.[0] as QuorumStatus | undefined;
    },
    enabled: !!meetingId,
  });

  // Update attendance status
  const updateAttendance = useMutation({
    mutationFn: async ({ userId, status, notes }: { userId: string; status: AttendanceStatus; notes?: string }) => {
      const { data, error } = await supabase
        .rpc('update_meeting_attendance', {
          p_meeting_id: meetingId!,
          p_user_id: userId,
          p_status: status,
          p_notes: notes || null,
        });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-attendees', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-quorum', meetingId] });
    },
    onError: (error) => {
      toast({
        title: 'Error updating attendance',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mark all present
  const markAllPresent = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .rpc('mark_all_present', { p_meeting_id: meetingId! });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-attendees', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-quorum', meetingId] });
      toast({
        title: 'Attendance updated',
        description: 'All attendees marked as present',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Add guest attendee
  const addGuest = useMutation({
    mutationFn: async ({ userId, notes }: { userId: string; notes?: string }) => {
      const { data, error } = await supabase
        .rpc('add_meeting_guest', {
          p_meeting_id: meetingId!,
          p_user_id: userId,
          p_notes: notes || null,
        });
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-attendees', meetingId] });
      toast({
        title: 'Guest added',
        description: 'Guest attendee has been added to the meeting',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error adding guest',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Start meeting with quorum check
  const startMeetingWithQuorum = useMutation({
    mutationFn: async (overrideReason?: string): Promise<StartMeetingResult> => {
      const { data, error } = await supabase
        .rpc('start_meeting_with_quorum_check', {
          p_meeting_id: meetingId!,
          p_override_reason: overrideReason || null,
        });
      
      if (error) throw error;
      return data as unknown as StartMeetingResult;
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['eos-meeting', meetingId] });
        queryClient.invalidateQueries({ queryKey: ['meeting-quorum', meetingId] });
        toast({
          title: 'Meeting started',
          description: result.quorum_met 
            ? 'Meeting started with quorum' 
            : 'Meeting started without full quorum',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Error starting meeting',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Computed values
  const presentCount = attendees?.filter(a => 
    a.attendance_status === 'attended' || a.attendance_status === 'late'
  ).length ?? 0;

  const invitedCount = attendees?.length ?? 0;

  const attendanceRate = invitedCount > 0 
    ? Math.round((presentCount / invitedCount) * 100) 
    : 0;

  return {
    attendees,
    attendeesLoading,
    quorumStatus,
    quorumLoading,
    presentCount,
    invitedCount,
    attendanceRate,
    updateAttendance,
    markAllPresent,
    addGuest,
    startMeetingWithQuorum,
  };
};
